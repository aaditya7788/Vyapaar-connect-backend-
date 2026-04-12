const prisma = require('../../../db');
const walletService = require('../wallet/wallet.service');
const { getIO } = require('../../../utils/socket');
const { sendPushToUser } = require('./booking.notification');

/**
 * Global Configuration & Constraints
 */
const CONFIG = {
    /** Maximum minutes a booking can stay PENDING before auto-expiry */
    ACCEPT_TIMEOUT_MIN: 15,
    /** Maximum hours a job can stay in active state without completion */
    ACTIVE_TIMEOUT_HOURS: 4,
};

class BookingService {
    /**
     * Internal Error Logger (Hardening)
     */
    _logError(context, error) {
        console.error(`[BookingService] ${context}:`, error.message);
    }

    /**
     * Real-time notification helper
     */
    _emit(room, event, data) {
        try {
            const io = getIO();
            io.to(room).emit(event, data);
            console.log(`📡 [Socket.io] Emitted ${event} to ${room}`);
        } catch (err) {
            this._logError('Socket emit failed', err);
        }
    }

    /**
     * Helper to get global system settings with fail-safe defaults.
     * Hardened to log DB infrastructure issues.
     */
    async getGlobalSetting(key, defaultValue) {
        try {
            const setting = await prisma.globalSettings.findUnique({ where: { key } });
            if (!setting) return defaultValue;
            if (setting.type === 'number') return parseFloat(setting.value);
            return setting.value;
        } catch (error) {
            // Log for observability but fall back to code-level default
            this._logError(`Setting lookup failed for ${key}`, error);
            return defaultValue;
        }
    }

    /**
     * Lazy expiry — mark all PENDING bookings older than timeout as EXPIRED.
     * Also marks active jobs (CONFIRMED/IN_PROGRESS) as EXPIRED if past 4 hours.
     * Called before list fetches and status updates to ensure consistency.
     */
    async expireStaleBookings(extraWhere = {}) {
        const now = new Date();
        const pendingCutoff = new Date(now.getTime() - CONFIG.ACCEPT_TIMEOUT_MIN * 60 * 1000);
        const activeCutoff = new Date(now.getTime() - CONFIG.ACTIVE_TIMEOUT_HOURS * 60 * 60 * 1000);
        
        try {
            // 1. Expire stale PENDING requests
            await prisma.booking.updateMany({
                where: {
                    status: 'PENDING',
                    createdAt: { lt: pendingCutoff },
                    ...extraWhere,
                },
                data: { status: 'EXPIRED' },
            });

            // 2. Expire stale ACTIVE jobs (Unfinished after 4 hours)
            await prisma.booking.updateMany({
                where: {
                    status: { in: ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] },
                    updatedAt: { lt: activeCutoff },
                    ...extraWhere,
                },
                data: { status: 'EXPIRED' },
            });
        } catch (err) {
            this._logError('Lazy-expiry sweep error', err);
        }
    }

    /**
     * Create bookings for a list of services (Bucket from Cart)
     */
    async createBookings({ userId, shopId, addressId, scheduledDate, scheduledTime, services }) {
        return await prisma.$transaction(async (tx) => {
            // Validate address ownership
            const address = await tx.userAddress.findFirst({
                where: { id: addressId, userId }
            });
            if (!address) throw new Error('Invalid or unauthorized address');

            // Validate shop
            const shop = await tx.shop.findUnique({ 
                where: { id: shopId },
                include: { providerProfile: true }
            });
            if (!shop) throw new Error('Provider shop not found');

            // Calculate total amount
            const totalAmount = services.reduce((sum, s) => sum + s.price, 0);

            // Generate dynamic IDs and OTPs
            const generateDisplayId = () => `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            const displayId = generateDisplayId();
            
            const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();
            const startOtp = generateOtp();
            const completionOtp = generateOtp();

            // Create a single booking for all services
            const booking = await tx.booking.create({
                data: {
                    displayId,
                    userId,
                    shopId,
                    addressId,
                    scheduledDate: new Date(scheduledDate),
                    scheduledTime,
                    totalAmount,
                    status: 'PENDING',
                    otp: startOtp,
                    completionOtp,
                    services: {
                        connect: services.map(s => ({ id: s.serviceId }))
                    }
                },
                include: {
                    services: true,
                    shop: {
                        include: {
                            providerProfile: true
                        }
                    },
                    user: {
                        select: {
                            fullName: true,
                            phone: true,
                            avatar: true
                        }
                    },
                    address: true
                }
            });

            // ── Credit Deduction: Request Fee ──
            await this._handleBookingRequestCredits(booking, tx);

            // Notify Provider in Real-time
            const providerUserId = booking.shop.providerProfile.userId;
            this._emit(`user_${providerUserId}`, 'new_booking', {
                bookingId: booking.id,
                displayId: booking.displayId,
                totalAmount: booking.totalAmount,
                userName: booking.user?.fullName || 'Customer'
            });

            // Push Notification to Provider
            const serviceNames = booking.services.map(s => s.name).join(', ');
            sendPushToUser(providerUserId, {
                title: '🔔 New Booking Request!',
                body: `${booking.user?.fullName || 'A customer'} requested ${serviceNames} for ₹${booking.totalAmount}.`
            }, { 
                type: 'new_booking', 
                bookingId: booking.id 
            });

            return [booking];
        });
    }

    /**
     * Get bookings for a provider's shop
     */
    async getProviderBookings(userId, shopId) {
        const shop = await prisma.shop.findFirst({
            where: {
                id: shopId,
                providerProfile: { userId }
            }
        });

        if (!shop) throw new Error('Unauthorized or shop not found');

        await this.expireStaleBookings({ shopId });

        const bookings = await prisma.booking.findMany({
            where: { shopId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        avatar: true,
                    }
                },
                services: true,
                address: true,
                shop: true,
                review: { include: { serviceRatings: true } },
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // ── Security Redaction ──
        return bookings.map(b => {
            const { otp, completionOtp, ...rest } = b;
            return rest;
        });
    }

    /**
     * Get all bookings for a customer
     */
    async getCustomerBookings(userId) {
        await this.expireStaleBookings({ userId });

        return await prisma.booking.findMany({
            where: { userId },
            include: {
                shop: true,
                services: true,
                address: true,
                review: { include: { serviceRatings: true } },
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
    }

    /**
     * Get booking details
     */
    async getBookingById(id, userId) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: {
                shop: true,
                services: true,
                address: true,
                review: { include: { serviceRatings: true } },
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        avatar: true
                    }
                }
            }
        });

        if (!booking) return null;
        
        // Check if requester is customer
        const isCustomer = booking.userId === userId;

        if (!isCustomer) {
            const profile = await prisma.providerProfile.findUnique({ where: { userId } });
            if (profile?.id !== booking.shop.providerProfileId) {
                throw new Error('Unauthorized');
            }
            
            // Redact for provider
            const redact = (({ otp, completionOtp, ...o }) => o)(booking);
            return redact;
        }

        return booking;
    }

    /**
     * Internal: Handle lead fee deduction when provider accepts
     */
    async _handleBookingAcceptanceCredits(booking, userId, tx) {
        const fee = await this.getGlobalSetting('booking_accept_fee', 2);
        if (fee <= 0) return;

        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;
        
        await walletService.deductCredits(
            userId, 
            fee, 
            'USED', 
            `Acceptance Fee: ${bookingNum}`, 
            { bookingId: booking.id }, 
            tx
        );
        
        await tx.booking.update({
            where: { id: booking.id },
            data: { creditFeePaid: true, creditFeeAmount: { increment: fee } }
        });
    }

    /**
     * Internal: Handle lead fee deduction when booking is requested
     */
    async _handleBookingRequestCredits(booking, tx) {
        const fee = await this.getGlobalSetting('booking_request_fee', 0);
        if (fee <= 0) return;

        const providerUserId = booking.shop.providerProfile.userId;
        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;

        await walletService.deductCredits(
            providerUserId,
            fee,
            'USED',
            `Lead Request Fee: ${bookingNum}`,
            { bookingId: booking.id },
            tx
        );

        await tx.booking.update({
            where: { id: booking.id },
            data: { creditFeePaid: true, creditFeeAmount: { increment: fee } }
        });
    }

    /**
     * Internal: Handle lead fee deduction when booking is completed
     */
    async _handleBookingCompletionCredits(booking, tx) {
        const fee = await this.getGlobalSetting('booking_complete_fee', 0);
        if (fee <= 0) return;

        const providerUserId = booking.shop.providerProfile.userId;
        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;

        await walletService.deductCredits(
            providerUserId,
            fee,
            'USED',
            `Completion Fee: ${bookingNum}`,
            { bookingId: booking.id },
            tx
        );

        await tx.booking.update({
            where: { id: booking.id },
            data: { creditFeePaid: true, creditFeeAmount: { increment: fee } }
        });
    }

    /**
     * Internal: Handle penalty deduction when provider declines
     */
    async _handleBookingDeclineCredits(booking, tx) {
        const fee = await this.getGlobalSetting('booking_decline_fee', 0);
        if (fee <= 0) return;

        const providerUserId = booking.shop.providerProfile.userId;
        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;

        await walletService.deductCredits(
            providerUserId,
            fee,
            'USED',
            `Decline Penalty: ${bookingNum}`,
            { bookingId: booking.id },
            tx
        );

        await tx.booking.update({
            where: { id: booking.id },
            data: { creditFeePaid: true, creditFeeAmount: { increment: fee } }
        });
    }

    /**
     * Internal: Handle lead fee refund when booking is cancelled
     */
    async _handleBookingCancellationRefund(booking, tx) {
        if (!booking.creditFeePaid) return;

        const refundAmount = booking.creditFeeAmount;
        const providerUserId = booking.shop.providerProfile.userId;
        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;

        await walletService.addCredits(
            providerUserId, 
            refundAmount, 
            'REFUND', 
            `Refund: Cancelled Booking ${bookingNum}`, 
            { bookingId: booking.id }, 
            tx
        );

        await tx.booking.update({
            where: { id: booking.id },
            data: { creditFeePaid: false, creditFeeAmount: 0 }
        });
    }

    /**
     * Update booking status (called by Customer OR Provider)
     * Refactored: verificationOtp clarifies dual-use (Start vs End)
     */
    async updateStatus(id, userId, status, verificationOtp = null) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { shop: { include: { providerProfile: true } } }
        });

        if (!booking) throw new Error('Booking not found');

        // Static logic: Terminal states cannot be modified
        const TERMINAL_STATES = ['EXPIRED', 'CANCELLED', 'DECLINED', 'COMPLETED'];
        if (TERMINAL_STATES.includes(booking.status)) {
            throw new Error(`This booking is ${booking.status.toLowerCase()} and can no longer be modified.`);
        }

        // Live expiry check (Sync with lazy sweep)
        if (booking.status === 'PENDING') {
            const elapsed = Date.now() - new Date(booking.createdAt).getTime();
            if (elapsed > CONFIG.ACCEPT_TIMEOUT_MIN * 60 * 1000) {
                await prisma.booking.update({ where: { id }, data: { status: 'EXPIRED' } });
                throw new Error('This booking has expired (provider did not respond in time).');
            }
        }

        const isCustomer = booking.userId === userId;
        const isProvider = booking.shop.providerProfile.userId === userId;

        if (!isCustomer && !isProvider) throw new Error('Unauthorized');

        // Role-based state machine validation
        if (isProvider) {
            // 1. Start Verification (verify start-trip OTP)
            if (['ARRIVED', 'IN_PROGRESS'].includes(status) && booking.status === 'CONFIRMED') {
                if (verificationOtp) {
                    const expected = String(booking.otp || '').trim();
                    const input = String(verificationOtp).trim();
                    if (expected && expected !== input) {
                        throw new Error('Invalid Verification OTP');
                    }
                }
            }

            // 2. End Verification (verify completion code)
            if (status === 'COMPLETED') {
                if (!verificationOtp) throw new Error('Completion OTP is required');
                const expected = String(booking.completionOtp || '').trim();
                const input = String(verificationOtp).trim();

                if (expected !== input) {
                    this._logError(`OTP Mismatch for ${id}`, new Error(`Expected [${expected}], Got [${input}]`));
                    throw new Error('Invalid Completion OTP');
                }
            }
        } else if (isCustomer) {
            if (status === 'CANCELLED' && !['PENDING', 'CONFIRMED'].includes(booking.status)) {
                throw new Error('Cannot cancel booking in current state');
            }
            if (status !== 'CANCELLED') {
                throw new Error('Customers can only cancel bookings');
            }
        }

        return await prisma.$transaction(async (tx) => {
            // Trigger Credit Hooks
            const acceptanceStatuses = ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'];
            
            if (isProvider && acceptanceStatuses.includes(status) && booking.status === 'PENDING') {
                await this._handleBookingAcceptanceCredits(booking, userId, tx);
            }

            if (isProvider && status === 'COMPLETED') {
                await this._handleBookingCompletionCredits(booking, tx);
            }

            if (isProvider && status === 'DECLINED' && booking.status === 'PENDING') {
                await this._handleBookingDeclineCredits(booking, tx);
            }

            if (status === 'CANCELLED') {
                await this._handleBookingCancellationRefund(booking, tx);
            }

            const updatedBooking = await tx.booking.update({
                where: { id },
                data: { status },
                include: {
                    user: {
                        select: {
                            fullName: true,
                            phone: true,
                            avatar: true
                        }
                    },
                    address: true,
                    services: true,
                    shop: true
                }
            });

            // Notify Customer & Provider
            this._emit(`user_${booking.userId}`, 'booking_updated', {
                bookingId: id,
                status
            });

            const providerId = booking.shop.providerProfile.userId;
            this._emit(`user_${providerId}`, 'booking_updated', {
                bookingId: id,
                status
            });

            // Push Notification to Customer
            const statusMessages = {
                CONFIRMED: 'Your request has been accepted! 🎉',
                ARRIVED: 'Provider has arrived at your location. 📍',
                IN_PROGRESS: 'Service has started. 🚀',
                COMPLETED: 'Job completed successfully! Thank you for using our service. ✨',
                CANCELLED: 'Booking has been cancelled.',
                DECLINED: 'Provider was unavailable and declined your request.',
                EXPIRED: 'Booking request has expired.'
            };

            if (statusMessages[status]) {
                sendPushToUser(booking.userId, {
                    title: `Booking Update: ${status}`,
                    body: statusMessages[status]
                }, { 
                    type: 'booking_status', 
                    bookingId: id,
                    status 
                });
            }

            return updatedBooking;
        });
    }
}

module.exports = new BookingService();
