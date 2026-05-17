const prisma = require('../../../db');
const walletService = require('../wallet/wallet.service');
const { getIO } = require('../../../utils/socket');
const { sendPushToUser, BOOKING_NOTIFICATION_MAP } = require('./booking.notification');
const { haversineDistance } = require('../../../utils/geo');

/**
 * Global Configuration & Constraints
 */
const CONFIG = {
    /** Global fallback for how long a provider has to accept a request (in minutes) */
    ACCEPT_TIMEOUT_MIN: 15,
    /** Default hours a job can stay in an active state (Confirmed/In Progress) before auto-expiry */
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
     * Helper to process the booking object before it's returned to the client.
     * Prioritizes the snapshotted 'addressData' over the related 'address' record.
     * Ensures historical data integrity even if the user updates their profile address.
     */
    _processBooking(booking) {
        if (!booking) return booking;
        if (booking.addressData) {
            // Replace the relation with the snapshot (Historical Integrity)
            booking.address = booking.addressData;
            delete booking.addressData;
        }
        return booking;
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
     * Generate a secure, alphanumeric Display ID (e.g., BK-SBC7A2)
     * Guaranteed to be unique via database check loop.
     */
    async _generateSecureId(tx, shopId, shopName) {
        const shopPrefix = (shopName || 'VC').substring(0, 3).toUpperCase().replace(/\s/g, 'X');
        let displayId;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            attempts++;
            // Generate a 5-character alphanumeric code (Base 36)
            const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
            displayId = `BK-${shopPrefix}${randomCode}`;

            const existing = await tx.booking.findUnique({
                where: { displayId },
                select: { id: true }
            });

            if (!existing) {
                isUnique = true;
            }
        }

        // Fallback for extreme cases: include timestamp if retries exceed limit
        if (!isUnique) {
            displayId = `BK-${shopPrefix}${Date.now().toString().slice(-6).toUpperCase()}`;
        }

        return displayId;
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
     * Robust helper to combine Date and Time strings into a single DateTime object.
     * Handles formats: "09:00 AM", "21:30", etc.
     */
    _getScheduledDateTime(date, timeStr) {
        if (!date || !timeStr) return null;
        try {
            const scheduledDateStr = new Date(date).toISOString().split('T')[0];
            let hours = 0, minutes = 0;
            
            if (timeStr.includes(' ')) {
                const [time, period] = timeStr.split(' ');
                const timeParts = time.split(':').map(Number);
                hours = timeParts[0];
                minutes = timeParts[1] || 0;
                if (period === 'PM' && hours < 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
            } else {
                const timeParts = timeStr.split(':').map(Number);
                hours = timeParts[0];
                minutes = timeParts[1] || 0;
            }
            // Force UTC by adding 'Z' if not present, to ensure consistency with Date.now()
            // This prevents timezone shifts where a job expires "exactly at scheduled time" 
            // due to server being in UTC and user being in a negative offset (like New York).
            const isoString = `${scheduledDateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00Z`;
            return new Date(isoString);
        } catch (e) {
            return null;
        }
    }

    /**
     * Lazy expiry — mark all PENDING bookings older than timeout as EXPIRED.
     * Also marks active jobs (CONFIRMED/IN_PROGRESS) as EXPIRED if past 4 hours.
     * Called before list fetches and status updates to ensure consistency.
     */
    async expireStaleBookings(extraWhere = {}) {
        const acceptTimeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
        const activeTimeoutHours = await this.getGlobalSetting('ACTIVE_TIMEOUT_HOURS', CONFIG.ACTIVE_TIMEOUT_HOURS);

        const now = new Date();
        const pendingCutoff = new Date(now.getTime() - acceptTimeout * 60 * 1000);

        try {
            // 0. Process On-Demand Dispatch Queue
            await this.processDispatchQueue(extraWhere);

            // 1. Fetch potential candidates for expiration
            // We fetch more broadly and filter in JS to handle complex 'Scheduled Time' logic
            const candidates = await prisma.booking.findMany({
                where: {
                    status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] },
                    ...extraWhere
                },
                select: { 
                    id: true, 
                    userId: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    scheduledDate: true,
                    scheduledTime: true,
                    totalAmount: true,
                    shopId: true,
                    shop: { 
                        select: { 
                            id: true, 
                            category: true, 
                            providerProfile: { select: { userId: true } } 
                        } 
                    },
                    user: { select: { fullName: true } },
                    items: {
                        include: { service: true },
                        take: 1
                    }
                }
            });

            const toExpire = [];
            for (const b of candidates) {
                if (b.status === 'PENDING') {
                    // Rule: Expire if provider didn't respond within the acceptance window
                    if (b.createdAt < pendingCutoff) {
                        console.log(`⏳ [Expiry] Expiring PENDING booking ${b.id}: Created at ${b.createdAt}, Cutoff was ${pendingCutoff}`);
                        toExpire.push(b);
                    }
                } else {
                    // Rule: Expire if past (Scheduled Time + ACTIVE_TIMEOUT_HOURS)
                    // We use Math.max to ensure we don't expire if they are actively updating it, 
                    // and we use the scheduled time to prevent premature expiry for future jobs.
                    const scheduledDateTime = this._getScheduledDateTime(b.scheduledDate, b.scheduledTime);
                    const expiryFromUpdate = new Date(b.updatedAt.getTime() + activeTimeoutHours * 60 * 60 * 1000);
                    
                    let finalExpiry = expiryFromUpdate;
                    if (scheduledDateTime) {
                        const expiryFromSchedule = new Date(scheduledDateTime.getTime() + activeTimeoutHours * 60 * 60 * 1000);
                        if (expiryFromSchedule > finalExpiry) finalExpiry = expiryFromSchedule;
                    }

                    if (now > finalExpiry) {
                        console.log(`⏰ [Expiry] Expiring ACTIVE booking ${b.id}: Final Expiry was ${finalExpiry}, Current time is ${now}`);
                        toExpire.push(b);
                    }
                }
            }

            if (toExpire.length > 0) {
                const ids = toExpire.map(b => b.id);
                
                // 2. Perform bulk update
                await prisma.booking.updateMany({
                    where: { id: { in: ids } },
                    data: { status: 'EXPIRED' }
                });

                // ── Stock Refund & Negligence Penalty (Bulk Expiry) ──
                for (const b of toExpire) {
                    // 1. Stock Refund
                    const bookingItems = await prisma.bookingItem.findMany({
                        where: { bookingId: b.id },
                        include: { service: true }
                    });
                    for (const item of bookingItems) {
                        if (item.service && item.service.stock !== -1 && item.service.stock !== null) {
                            await prisma.service.update({
                                where: { id: item.serviceId },
                                data: { stock: { increment: item.quantity } }
                            });
                        }
                    }

                    // 2. Negligence Penalty (If was Active)
                    // If the booking was accepted but never completed, charge penalty and hit reputation
                    if (b.status !== 'PENDING' && b.shop?.providerProfile?.userId) {
                        try {
                            await this._handleBookingExpiryPenalty(b, prisma);
                        } catch (penaltyErr) {
                            this._logError('Expiry penalty application failed', penaltyErr);
                        }
                    }
                }

                // 3. Notify affected users (Limited to 20 per sweep)
                for (const booking of toExpire.slice(0, 20)) {
                    // Notify Customer (UI Sync)
                    this._emit(`user_${booking.userId}`, 'booking_updated', {
                        bookingId: booking.id,
                        status: 'EXPIRED'
                    });

                    // Notify Provider (UI Sync)
                    if (booking.shop?.providerProfile?.userId) {
                        this._emit(`user_${booking.shop.providerProfile.userId}`, 'booking_updated', {
                            bookingId: booking.id,
                            status: 'EXPIRED'
                        });
                    }

                    const serviceName = booking.items?.[0]?.service?.name || 'Service';
                    const customerName = booking.user?.fullName || 'A customer';

                    // ── Notify Customer ──
                    const customerTemplate = BOOKING_NOTIFICATION_MAP.EXPIRED.customer;
                    sendPushToUser(booking.userId, {
                        title: customerTemplate.title,
                        body: typeof customerTemplate.body === 'function' ? customerTemplate.body({ serviceName }) : customerTemplate.body
                    }, {
                        type: 'booking_status',
                        bookingId: booking.id,
                        status: 'EXPIRED',
                        category: booking.shop?.category,
                        serviceName,
                        scheduledTime: booking.scheduledTime,
                        totalAmount: booking.totalAmount || 0,
                        targetContext: 'customer'
                    });

                    // ── Notify Provider (Standard Expiry) ──
                    if (booking.status === 'PENDING' && booking.shop?.providerProfile?.userId) {
                        const providerUserId = booking.shop.providerProfile.userId;
                        const providerTemplate = BOOKING_NOTIFICATION_MAP.EXPIRED.provider;

                        console.log(`📡 [Push Debug] Sending Expiry Push to Provider: ${providerUserId}`);
                        sendPushToUser(providerUserId, {
                            title: providerTemplate.title,
                            body: typeof providerTemplate.body === 'function' ? providerTemplate.body({ customerName, serviceName }) : providerTemplate.body
                        }, {
                            type: 'booking_status',
                            bookingId: booking.id,
                            status: 'EXPIRED',
                            customerName,
                            serviceName,
                            targetContext: 'provider'
                        });
                    }
                }
            }
        } catch (err) {
            this._logError('Lazy-expiry sweep error', err);
        }
    }

    /**
     * Process timeouts for On-Demand Dispatch bookings.
     * Moves to the next provider in the queue or expires if no providers left.
     */
    async processDispatchQueue(extraWhere = {}) {
        const now = new Date();

        try {
            // Find bookings that have timed out their current dispatch window
            const timedOutBookings = await prisma.booking.findMany({
                where: {
                    status: 'PENDING',
                    dispatchTimeoutAt: { lt: now },
                    potentialProviders: { isEmpty: false },
                    ...extraWhere
                },
                include: {
                    user: { select: { fullName: true, remarkScore: true } },
                    items: { include: { service: true } },
                    address: true
                }
            });

            for (const booking of timedOutBookings) {
                const nextIndex = booking.currentProviderIndex + 1;

                if (nextIndex < booking.potentialProviders.length) {
                    // Move to next provider
                    const nextShopId = booking.potentialProviders[nextIndex];
                    const acceptTimeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
                    const nextTimeout = new Date(now.getTime() + acceptTimeout * 60 * 1000);

                    await prisma.booking.update({
                        where: { id: booking.id },
                        data: {
                            shopId: nextShopId,
                            currentProviderIndex: nextIndex,
                            dispatchTimeoutAt: nextTimeout,
                            totalRetries: { increment: 1 }
                        }
                    });

                    // Notify the next provider
                    const shop = await prisma.shop.findUnique({
                        where: { id: nextShopId },
                        include: { providerProfile: true }
                    });

                    if (shop) {
                        const providerUserId = shop.providerProfile.userId;
                        this._emit(`user_${providerUserId}`, 'new_booking', {
                            bookingId: booking.id,
                            displayId: booking.displayId,
                            totalAmount: booking.totalAmount,
                            userName: booking.user?.fullName || 'Customer',
                            userRemarkScore: booking.user?.remarkScore || 0,
                            address: booking.address?.address,
                            latitude: booking.address?.latitude,
                            longitude: booking.address?.longitude,
                            servicesList: booking.items?.map(item => ({
                                name: item.service?.name,
                                image: item.service?.image,
                                price: item.price,
                                quantity: item.quantity,
                                metadata: item.metadata
                            })) || booking.services?.map(s => ({ name: s.name, image: s.image, price: s.price })),
                            itemCount: booking.items?.length || booking.services?.length,
                            scheduledTime: booking.scheduledTime,
                            scheduledDate: booking.scheduledDate,
                            createdAt: booking.createdAt
                        });

                        sendPushToUser(providerUserId, {
                            title: '🔔 New Booking Request!',
                            body: `A customer requested a service for ₹${booking.totalAmount}.`
                        }, {
                            type: 'new_booking',
                            bookingId: booking.id,
                            shopId: nextShopId,
                            targetContext: 'provider'
                        });
                    }
                } else {
                    // No more providers left
                    await prisma.booking.update({
                        where: { id: booking.id },
                        data: { status: 'EXPIRED' }
                    });

                    // ── Stock Refund (Dispatch Timeout) ──
                    for (const item of booking.items || []) {
                        if (item.service && item.service.stock !== -1 && item.service.stock !== null) {
                            await prisma.service.update({
                                where: { id: item.serviceId },
                                data: { stock: { increment: item.quantity } }
                            });
                        }
                    }

                    // Notify Customer
                    this._emit(`user_${booking.userId}`, 'booking_updated', {
                        bookingId: booking.id,
                        status: 'EXPIRED',
                        message: 'No providers available at the moment. Please try another time.'
                    });

                    sendPushToUser(booking.userId, {
                        title: 'Order Expired',
                        body: 'Your booking has expired as it was not processed in time.'
                    }, {
                        type: 'booking_status',
                        bookingId: booking.id,
                        status: 'EXPIRED',
                        category: booking.items?.[0]?.service?.category || 'Service',
                        serviceName: booking.items?.[0]?.service?.name || 'Service',
                        scheduledTime: booking.scheduledTime,
                        totalAmount: booking.totalAmount || 0,
                        targetContext: 'customer',
                        isDataOnly: true // 🚀 Fix: Prevent duplicates
                    });
                }
            }
        } catch (err) {
            this._logError('Dispatch queue processing error', err);
        }
    }

    /**
     * Create an On-Demand booking by finding the nearest providers.
     */
    async createOnDemandBooking({ userId, addressId, scheduledDate, scheduledTime, services, serviceType }) {
        return await prisma.$transaction(async (tx) => {
            // 1. Validate Address
            const address = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
            if (!address) throw new Error('Invalid address');

            // 2. Find Verified Providers for this Service Type
            const shops = await tx.shop.findMany({
                where: {
                    status: 'VERIFIED',
                    category: serviceType
                },
                select: { id: true, latitude: true, longitude: true }
            });

            if (existing) {
                const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - new Date(existing.createdAt).getTime())) / (60 * 60 * 1000));
                throw new Error(`You have already submitted a report recently. Please wait ${hoursLeft} hours before reporting again.`);
            }  // 3. Sort by distance (Haversine)
            const sortedShops = shops.map(shop => ({
                id: shop.id,
                distance: haversineDistance(address.latitude, address.longitude, shop.latitude, shop.longitude)
            }))
                .filter(s => s.distance !== null)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3); // Top 3 potential providers

            if (sortedShops.length === 0) throw new Error('No providers available in your area.');

            const potentialProviders = sortedShops.map(s => s.id);
            const firstShopId = potentialProviders[0];
            const acceptTimeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
            const timeout = new Date(Date.now() + acceptTimeout * 60 * 1000);

            // 4. Create Booking
            const displayId = await this._generateSecureId(tx, firstShopId, (await tx.shop.findUnique({ where: { id: firstShopId }, select: { name: true } }))?.name);

            // ── Stock Validation & Decrement (On-Demand) ──
            const dbServices = await tx.service.findMany({
                where: { id: { in: services.map(s => s.serviceId) } }
            });

            for (const s of dbServices) {
                if (s.stock !== -1 && s.stock !== null) {
                    const requested = services.find(req => req.serviceId === s.id)?.quantity || 1;
                    if (s.stock < requested) {
                        throw new Error(`Booking failed: ${s.name} just went out of stock.`);
                    }
                    await tx.service.update({
                        where: { id: s.id },
                        data: { stock: { decrement: requested } }
                    });
                }
            }

            const booking = await tx.booking.create({
                data: {
                    displayId,
                    userId,
                    addressId,
                    addressData: address, // Snapshot address (Phase 11.1)
                    shopId: firstShopId, // Set to the first provider
                    scheduledDate: new Date(scheduledDate),
                    scheduledTime,
                    totalAmount: services.reduce((sum, s) => sum + (parseFloat(s.price) * (s.quantity || 1)), 0),
                    status: 'PENDING',
                    potentialProviders,
                    currentProviderIndex: 0,
                    dispatchTimeoutAt: timeout,
                    items: {
                        create: services.map(s => ({
                            serviceId: s.serviceId,
                            quantity: s.quantity || 1,
                            price: s.price,
                            metadata: s.metadata || (s.selectedInclusions ? { selectedInclusions: s.selectedInclusions } : null)
                        }))
                    },
                    chatRoom: {
                        create: {} // Create locked chat room (Phase 112.1)
                    }
                },
                include: {
                    user: { select: { fullName: true } },
                    shop: { include: { providerProfile: true } },
                    chatRoom: true
                }
            });

            // 5. Notify First Provider
            const providerUserId = booking.shop.providerProfile.userId;
            this._emit(`user_${providerUserId}`, 'new_booking', {
                bookingId: booking.id,
                displayId: booking.displayId,
                totalAmount: booking.totalAmount,
                userName: booking.user?.fullName || 'Customer',
                userRemarkScore: booking.user?.remarkScore || 0,
                address: booking.address?.address,
                latitude: booking.address?.latitude,
                longitude: booking.address?.longitude,
                servicesList: booking.items?.map(item => ({
                    name: item.service?.name,
                    image: item.service?.image,
                    price: item.price,
                    quantity: item.quantity,
                    metadata: item.metadata
                })),
                itemCount: booking.items?.length,
                scheduledTime: booking.scheduledTime,
                scheduledDate: booking.scheduledDate,
                createdAt: booking.createdAt
            });

            const providerTemplate = BOOKING_NOTIFICATION_MAP.NEW_REQUEST.provider;
            const customerName = booking.user?.fullName || 'A customer';
            const serviceName = booking.items?.[0]?.service?.name || 'Service';

            console.log(`📡 [Push Debug] Sending New Request Push to Provider: ${providerUserId}`);
            sendPushToUser(providerUserId, {
                title: providerTemplate.title,
                body: typeof providerTemplate.body === 'function' ? providerTemplate.body({ totalAmount: booking.totalAmount }) : providerTemplate.body
            }, {
                type: 'new_booking',
                bookingId: booking.id,
                shopId: firstShopId,
                customerName,
                serviceName,
                totalAmount: String(booking.totalAmount),
                targetContext: 'provider'
            });

            return this._processBooking(booking);
        });
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
            
            // ── Administrative Lockdown Checks ──
            if (shop.isFrozen) {
                throw new Error('Booking failed: This shop is temporarily frozen by an administrator.');
            }
            if (shop.providerProfile && !shop.providerProfile.isActive) {
                throw new Error('Booking failed: The provider for this shop is currently suspended.');
            }

            // ── Anti Double-Booking Check (Race Condition Protection) ──
            const startOfDay = new Date(new Date(scheduledDate).setUTCHours(0, 0, 0, 0));
            const endOfDay = new Date(new Date(scheduledDate).setUTCHours(23, 59, 59, 999));

            const existingInSlot = await tx.booking.findFirst({
                where: {
                    shopId,
                    scheduledDate: { gte: startOfDay, lte: endOfDay },
                    scheduledTime,
                    status: { notIn: ['CANCELLED', 'DECLINED', 'EXPIRED'] }
                }
            });

            if (existingInSlot) {
                throw new Error('This time slot was just taken by another customer. Please select a different time.');
            }

            // ── Service Status Lockdown ──
            // Fetch latest status of all requested services to prevent 'Ghost Bookings'
            const dbServices = await tx.service.findMany({
                where: {
                    id: { in: services.map(s => s.serviceId) },
                    shopId: shopId
                }
            });

            const inactiveServices = dbServices.filter(s => !s.isActive);
            if (inactiveServices.length > 0) {
                const names = inactiveServices.map(s => s.name).join(', ');
                throw new Error(`Booking failed: The following services are currently unavailable: ${names}. Please remove them from your cart.`);
            }

            console.log(`[Booking Debug] Requested Services:`, services.map(s => s.serviceId));
            console.log(`[Booking Debug] Found in DB:`, dbServices.map(s => s.id));
            console.log(`[Booking Debug] Requested Shop:`, shopId);
            console.log(`[Booking Debug] DB Service Shops:`, dbServices.map(s => s.shopId));

            if (dbServices.length !== services.length) {
                throw new Error('Booking failed: Some selected services no longer exist. Please refresh your cart.');
            }

            // ── Stock Validation ──
            const outOfStock = dbServices.filter(s => {
                if (s.stock === -1 || s.stock === null) return false; // Unlimited
                const requested = services.find(req => req.serviceId === s.id)?.quantity || 1;
                return s.stock < requested;
            });

            if (outOfStock.length > 0) {
                const names = outOfStock.map(s => s.name).join(', ');
                throw new Error(`Booking failed: The following items just went out of stock: ${names}. Please refresh your cart.`);
            }

            // ── Stock Decrement ──
            for (const s of dbServices) {
                if (s.stock !== -1 && s.stock !== null) {
                    const requested = services.find(req => req.serviceId === s.id)?.quantity || 1;
                    await tx.service.update({
                        where: { id: s.id },
                        data: { stock: { decrement: requested } }
                    });
                }
            }

            // Calculate total amount with quantities
            const totalAmount = services.reduce((sum, s) => sum + (parseFloat(s.price) * (s.quantity || 1)), 0);

            // Generate dynamic IDs and OTPs
            // Generate systematic Display ID: BK-SHP123
            const displayId = await this._generateSecureId(tx, shopId, shop.name);

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
                    addressData: address, // Snapshot address (Phase 11.1)
                    scheduledDate: new Date(scheduledDate),
                    scheduledTime,
                    totalAmount,
                    status: 'PENDING',
                    otp: startOtp,
                    completionOtp,
                    // New Phase 13 Items Logic
                    items: {
                        create: services.map(s => ({
                            serviceId: s.serviceId,
                            quantity: s.quantity || 1,
                            price: s.price,
                            metadata: s.metadata || (s.selectedInclusions ? { selectedInclusions: s.selectedInclusions } : null)
                        }))
                    },
                    // Backward compatibility
                    services: {
                        connect: services.map(s => ({ id: s.serviceId }))
                    },
                    chatRoom: {
                        create: {} // Create locked chat room (Phase 112.1)
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
                            avatar: true,
                            remarkScore: true
                        }
                    },
                    address: true,
                    items: {
                        include: {
                            service: true
                        }
                    },
                    chatRoom: true
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
                userName: booking.user?.fullName || 'Customer',
                address: booking.address?.address,
                latitude: booking.address?.latitude,
                longitude: booking.address?.longitude,
                servicesList: booking.items?.map(item => ({
                    name: item.service?.name,
                    image: item.service?.image,
                    price: item.price,
                    quantity: item.quantity,
                    metadata: item.metadata
                })) || booking.services?.map(s => ({ name: s.name, image: s.image, price: s.price })),
                itemCount: booking.items?.length || booking.services?.length,
                scheduledTime: booking.scheduledTime,
                scheduledDate: booking.scheduledDate,
                createdAt: booking.createdAt
            });

            // Push Notification to Provider
            const serviceNames = booking.services.map(s => s.name).join(', ');
            sendPushToUser(providerUserId, {
                title: '🔔 New Booking Request!',
                body: `${booking.user?.fullName || 'A customer'} requested ${serviceNames} for ₹${booking.totalAmount}.`
            }, {
                type: 'new_booking',
                bookingId: booking.id,
                shopId: booking.shopId,
                targetContext: 'provider'
            });

            // 6. Seed System Message for Inbox Visibility
            try {
                await tx.message.create({
                    data: {
                        roomId: booking.chatRoom.id,
                        senderId: 'SYSTEM',
                        content: 'Booking request sent. Conversation will unlock once the provider accepts.',
                        type: 'SYSTEM',
                    }
                });
            } catch (msgErr) {
                console.error('[BookingService] Failed to seed system message:', msgErr.message);
            }

            return [this._processBooking(booking)];
        });
    }

    /**
     * Get bookings for a provider's shop with pagination and filtering
     */
    async getProviderBookings(userId, shopId, { page = 1, limit = 10, status, date, startDate } = {}) {
        const shop = await prisma.shop.findFirst({
            where: {
                id: shopId,
                providerProfile: { userId }
            }
        });

        if (!shop) throw new Error('Unauthorized or shop not found');

        await this.expireStaleBookings({ shopId });

        const where = { shopId };
        let finalTake = parseInt(limit);
        let finalSkip = (page - 1) * limit;

        if (startDate && page == 1) {
            // Snapshot mode: Fetch all recent data
            where.createdAt = { gte: new Date(startDate) };
            finalTake = 100; // Snapshot limit
            finalSkip = 0;
        } else if (startDate && page > 1) {
            // History mode: Fetch anything older than the snapshot window
            where.createdAt = { lt: new Date(startDate) };
        }

        if (date) {
            const start = new Date(new Date(date).setUTCHours(0, 0, 0, 0));
            const end = new Date(new Date(date).setUTCHours(23, 59, 59, 999));
            where.scheduledDate = { gte: start, lte: end };
        }
        if (status && status !== 'ALL' && status !== 'all') {
            const s = status.toUpperCase();
            if (s === 'ONGOING') {
                where.status = { in: ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] };
            } else if (s === 'DECLINE' || s === 'DECLINED') {
                where.status = { in: ['DECLINED', 'EXPIRED', 'CANCELLED'] };
            } else if (s === 'NEW') {
                where.status = 'PENDING';
            } else {
                where.status = s;
            }
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                skip: finalSkip,
                take: finalTake,
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            avatar: true,
                            remarkScore: true,
                        }
                    },
                    services: true,
                    items: {
                        include: {
                            service: true
                        }
                    },
                    address: true,
                    shop: true,
                    chatRoom: true,
                    review: { include: { serviceRatings: true } },
                },
                orderBy: {
                    createdAt: 'desc'
                }
            }),
            prisma.booking.count({ where })
        ]);

        // ── Security Redaction ──
        const redacted = bookings.map(b => {
            const { otp, completionOtp, ...rest } = this._processBooking(b);
            return rest;
        });

        return {
            bookings: redacted,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / (page == 1 ? finalTake : parseInt(limit)))
            }
        };
    }

    /**
     * Get all bookings for a customer with pagination and filtering
     */
    async getCustomerBookings(userId, { page = 1, limit = 10, status, startDate } = {}) {
        await this.expireStaleBookings({ userId });

        const where = { userId };
        let finalTake = parseInt(limit);
        let finalSkip = (page - 1) * limit;

        if (startDate && page == 1) {
            // Snapshot mode
            where.createdAt = { gte: new Date(startDate) };
            finalTake = 100;
            finalSkip = 0;
        } else if (startDate && page > 1) {
            // History mode
            where.createdAt = { lt: new Date(startDate) };
        }
        if (status && status !== 'ALL' && status !== 'all') {
            const s = status.toUpperCase();
            if (s === 'ACCEPTED' || s === 'ONGOING') {
                where.status = { in: ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] };
            } else if (s === 'DECLINED') {
                where.status = { in: ['DECLINED', 'EXPIRED', 'CANCELLED'] };
            } else if (s === 'PENDING') {
                where.status = 'PENDING';
            } else {
                where.status = s;
            }
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                skip: finalSkip,
                take: finalTake,
                include: {
                    shop: {
                        include: {
                            community: true
                        }
                    },
                    items: {
                        include: {
                            service: true
                        }
                    },
                    address: true,
                    chatRoom: true,
                    review: { include: { serviceRatings: true } },
                },
                orderBy: {
                    createdAt: 'desc'
                }
            }),
            prisma.booking.count({ where })
        ]);

        return {
            bookings: bookings.map(b => this._processBooking(b)),
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / (page == 1 ? finalTake : parseInt(limit)))
            }
        };
    }

    /**
     * Get booking details
     */
    async getBookingById(id, userId) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        service: true
                    }
                },
                address: true,
                review: { include: { serviceRatings: true } },
                chatRoom: true,
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        avatar: true,
                    }
                },
                shop: {
                    include: {
                        community: true,
                        providerProfile: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        fullName: true,
                                        avatar: true,
                                        isOnline: true,
                                        lastSeen: true
                                    }
                                }
                            }
                        }
                    }
                },
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
            const { otp, completionOtp, ...redact } = booking;

            // Ensure phone is never shared even if fetched
            if (redact.user) {
                delete redact.user.phone;
            }

            // ── Attach Category Settings (Redacted View) ──
            if (redact.shop?.category) {
                const catSettings = await prisma.category.findUnique({
                    where: { name: redact.shop.category },
                    select: { startOtpRequired: true }
                });
                redact.startOtpRequired = catSettings?.startOtpRequired ?? false;
            }

            return redact;
        }

        // ── Attach Category Settings ──
        if (booking.shop?.category) {
            const catSettings = await prisma.category.findUnique({
                where: { name: booking.shop.category },
                select: { startOtpRequired: true }
            });
            booking.startOtpRequired = catSettings?.startOtpRequired ?? false;
        }

        // ── Check for existing reports based on dynamic cooldown ──
        const cooldownSetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_COOLDOWN_HOURS' } });
        const cooldownHours = cooldownSetting ? parseInt(cooldownSetting.value) : 24;

        const targetId = booking.shopId;
        const whereClause = {
            reporterId: userId,
            targetId,
            bookingId: id // check specifically for THIS booking
        };

        const recentReport = await prisma.remark.findFirst({ where: whereClause });
        booking.hasReported = !!recentReport;

        return this._processBooking(booking);
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
        if (fee > 0) {
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

        // --- Trust & Safety: Apply Bonus ---
        const bonusSetting = await this.getGlobalSetting('trust_score_bonus', 0);
        if (bonusSetting > 0) {
            const bonus = parseInt(bonusSetting);
            await tx.shop.update({ where: { id: booking.shopId }, data: { remarkScore: { decrement: bonus } } });
            await tx.user.update({ where: { id: booking.userId }, data: { remarkScore: { decrement: bonus } } });
            console.log(`🛡️ [Trust System] Applied ${bonus}pt bonus to Shop ${booking.shopId} and User ${booking.userId}`);
        }
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
     * Internal: Handle penalty deduction when booking expires in an active state
     */
    async _handleBookingExpiryPenalty(booking, tx) {
        const fee = await this.getGlobalSetting('booking_expire_penalty', 0);
        const providerUserId = booking.shop.providerProfile.userId;
        const bookingNum = booking.displayId || `#BK-${booking.id.slice(0, 8).toUpperCase()}`;

        // 1. Deduct Credits (Allowing Debt/Negative Balance as per Option 1)
        if (fee > 0) {
            await walletService.deductCredits(
                providerUserId,
                fee,
                'USED',
                `Expiry Penalty: ${bookingNum}`,
                { bookingId: booking.id, allowNegative: true },
                tx
            );
            
            await tx.booking.update({
                where: { id: booking.id },
                data: { creditFeePaid: true, creditFeeAmount: { increment: fee } }
            });

            // ── Notify Provider (Push + Socket) ──
            sendPushToUser(providerUserId, {
                title: '⚠️ Negligence Penalty Charged',
                body: `Booking ${bookingNum} was not completed in time. ${fee} credits have been deducted from your wallet.`
            }, {
                type: 'wallet_update',
                bookingId: booking.id,
                penaltyAmount: String(fee), // 🔥 MUST BE STRING for FCM
                targetContext: 'provider'
            });

            this._emit(`user_${providerUserId}`, 'wallet_updated', {
                bookingId: booking.id,
                penaltyAmount: fee,
                message: `Penalty charged for ${bookingNum}`
            });
        }

        console.log(`⚠️ [Negligence] Applied Expiry Penalty to Provider ${providerUserId} for Booking ${bookingNum}`);
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
    async updateStatus(id, userId, status, verificationOtp = null, reason = null) {
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
            const timeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
            const elapsed = Date.now() - new Date(booking.createdAt).getTime();
            if (elapsed > timeout * 60 * 1000) {
                await prisma.booking.update({ where: { id }, data: { status: 'EXPIRED' } });
                throw new Error('This booking has expired (acceptance window closed).');
            }
        }

        const isCustomer = booking.userId === userId;
        const isProvider = booking.shop.providerProfile.userId === userId;

        if (!isCustomer && !isProvider) throw new Error('Unauthorized');

        // Role-based state machine validation
        if (isProvider) {
            // ── Fetch Category Settings (Start OTP Lockdown) ──
            const categoryName = booking.shop.category;
            const category = categoryName ? await prisma.category.findUnique({ where: { name: categoryName } }) : null;
            const startOtpRequired = category?.startOtpRequired ?? false;

            // 1. Start Verification (verify start-trip OTP)
            if (['ARRIVED', 'IN_PROGRESS'].includes(status) && booking.status === 'CONFIRMED') {
                if (startOtpRequired) {
                    if (!verificationOtp) throw new Error('Start Verification OTP is required for this service category');

                    const expected = String(booking.otp || '').trim();
                    const input = String(verificationOtp).trim();
                    if (expected && expected !== input) {
                        throw new Error('Invalid Verification OTP');
                    }
                }
                // If skip logic is on, we might auto-transition or just allow it. 
                // The provider hub UI will handle showing/hiding the button.
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
            // CANCELLATION LOCKDOWN Logic
            if (status === 'CANCELLED') {
                if (booking.status === 'PENDING') {
                    // Always allowed for pending
                } else if (['CONFIRMED', 'ACCEPTED'].includes(booking.status)) {
                    // Check window (Default 24 hours)
                    const cancelWindow = await this.getGlobalSetting('CANCEL_WINDOW_HOURS', 24);
                    
                    if (cancelWindow > 0) {
                        const now = new Date();
                        const scheduledDateTime = this._getScheduledDateTime(booking.scheduledDate, booking.scheduledTime);
                        if (!scheduledDateTime) throw new Error('Could not determine scheduled time for cancellation check');
                        
                        const diffHours = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                        
                        if (diffHours < cancelWindow) {
                            throw new Error(`Cancellation is not possible as your appointment is scheduled within ${cancelWindow} hours.`);
                        }
                    }
                } else {
                    throw new Error(`This booking is currently ${booking.status.toLowerCase()} and cannot be cancelled.`);
                }
            }

            // Customers cannot perform other state transitions
            if (status !== 'CANCELLED' && booking.status !== 'PENDING') {
                throw new Error('Customers can only cancel bookings or modify pending requests.');
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
                // Real-time stat update for Search Results
                await tx.shop.update({
                    where: { id: booking.shopId },
                    data: { jobsCompleted: { increment: 1 } }
                });
            }

            if (isProvider && status === 'DECLINED' && booking.status === 'PENDING') {
                await this._handleBookingDeclineCredits(booking, tx);
            }

            // ── Stock Refund Logic (Phase: Quantitative Awareness) ──
            const refundStatuses = ['CANCELLED', 'DECLINED', 'EXPIRED'];
            if (refundStatuses.includes(status) && !refundStatuses.includes(booking.status)) {
                const items = await tx.bookingItem.findMany({
                    where: { bookingId: id },
                    include: { service: true }
                });

                for (const item of items) {
                    if (item.service && item.service.stock !== -1 && item.service.stock !== null) {
                        await tx.service.update({
                            where: { id: item.serviceId },
                            data: { stock: { increment: item.quantity } }
                        });
                    }
                }
            }

            if (status === 'CANCELLED') {
                await this._handleBookingCancellationRefund(booking, tx);
            }

            const updatedBooking = await tx.booking.update({
                where: { id },
                data: { 
                    status,
                    ...(status === 'DECLINED' && { declineReason: reason })
                },
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
                    items: {
                        include: {
                            service: true
                        }
                    },
                    shop: true
                }
            });

            // ── Persist Context for Templates ──
            const templateData = {
                customerName: updatedBooking.user?.fullName || 'Customer',
                providerName: updatedBooking.shop?.name || 'Professional',
                serviceName: updatedBooking.items?.[0]?.service?.name || 'Service',
                time: updatedBooking.scheduledTime,
                reason: reason
            };

            const config = BOOKING_NOTIFICATION_MAP[status];

            // ── Notify Customer (Socket + Push) ──
            if (config?.customer) {
                const customerMsg = {
                    title: typeof config.customer.title === 'function' ? config.customer.title(templateData) : config.customer.title,
                    body: typeof config.customer.body === 'function' ? config.customer.body(templateData) : config.customer.body
                };

                this._emit(`user_${booking.userId}`, 'booking_updated', {
                    bookingId: id,
                    status,
                    reason,
                    targetContext: 'customer',
                    profileKey: 'CUSTOMER_UPDATE',
                    ...customerMsg // title and body for Global Alert
                });

                sendPushToUser(updatedBooking.userId, {
                    title: customerMsg.title,
                    body: customerMsg.body
                }, {
                    type: 'booking_status',
                    bookingId: id,
                    status,
                    targetContext: 'customer',
                    isDataOnly: true 
                });
            }

            // ── Notify Provider (Socket + Push) ──
            const providerId = booking.shop?.providerProfile?.userId;
            if (providerId && config?.provider) {
                const providerMsg = {
                    title: typeof config.provider.title === 'function' ? config.provider.title(templateData) : config.provider.title,
                    body: typeof config.provider.body === 'function' ? config.provider.body(templateData) : config.provider.body
                };

                this._emit(`user_${providerId}`, 'booking_updated', {
                    bookingId: id,
                    status,
                    targetContext: 'provider',
                    profileKey: 'CUSTOMER_UPDATE', // Chime is fine for updates
                    ...providerMsg // title and body for Global Alert
                });

                // Only send push to provider if it's a "takeaway" status (Cancelled, Expired)
                // Professionals don't need a push when they themselves Accept/Arrive/Complete (it would be annoying)
                if (['CANCELLED', 'EXPIRED'].includes(status)) {
                    sendPushToUser(providerId, {
                        title: providerMsg.title,
                        body: providerMsg.body
                    }, {
                        type: 'booking_status',
                        bookingId: id,
                        status,
                        targetContext: 'provider',
                        isDataOnly: true
                    });
                }
            }

            // ── Chat Unlocking Logic (Phase 112.1) ──
            if (status === 'CONFIRMED') {
                const chatService = require('../chat/chat.service');
                try {
                    await chatService.unlockRoom(id);
                } catch (err) {
                    this._logError('Failed to unlock chat room', err);
                }
            }

            return this._processBooking(updatedBooking);
        });
    }

    /**
     * Reschedule a pending booking (Customer Edit)
     */
    async rescheduleBooking(id, userId, { scheduledDate, scheduledTime }) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { 
                user: { select: { fullName: true, remarkScore: true } },
                shop: { include: { providerProfile: true } },
                items: { include: { service: true } },
                address: true
            }
        });

        if (!booking) throw new Error('Booking not found');
        if (booking.userId !== userId) throw new Error('Unauthorized');
        if (booking.status !== 'PENDING' && booking.status !== 'WAITING FOR PROVIDER') {
            throw new Error('Only pending bookings can be edited');
        }

        const retryLimit = await this.getGlobalSetting('BOOKING_RETRY_LIMIT', 3);
        if (booking.totalRetries >= retryLimit) {
            throw new Error(`Maximum edit limit (${retryLimit}) reached for this booking.`);
        }

        // Anti Double-Booking Check
        const startOfDay = new Date(new Date(scheduledDate).setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date(scheduledDate).setUTCHours(23, 59, 59, 999));

        const existingInSlot = await prisma.booking.findFirst({
            where: {
                shopId: booking.shopId,
                scheduledDate: { gte: startOfDay, lte: endOfDay },
                scheduledTime,
                status: { notIn: ['CANCELLED', 'DECLINED', 'EXPIRED'] },
                id: { not: booking.id }
            }
        });

        if (existingInSlot) {
            throw new Error('This time slot is taken. Please select a different time.');
        }

        const now = new Date();
        const acceptTimeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
        const nextTimeout = new Date(now.getTime() + acceptTimeout * 60 * 1000);
        
        // Notify Provider of old slot cancellation
        const providerUserId = booking.shop.providerProfile.userId;
        const templateData = {
            customerName: booking.user?.fullName || 'Customer',
            providerName: booking.shop?.name || 'Professional',
            serviceName: booking.items?.[0]?.service?.name || 'Service',
            time: booking.scheduledTime,
            reason: 'Rescheduled by customer'
        };

        const cancelConfig = BOOKING_NOTIFICATION_MAP['CANCELLED'];
        if (cancelConfig?.provider) {
            const providerMsg = {
                title: typeof cancelConfig.provider.title === 'function' ? cancelConfig.provider.title(templateData) : cancelConfig.provider.title,
                body: typeof cancelConfig.provider.body === 'function' ? cancelConfig.provider.body(templateData) : cancelConfig.provider.body
            };

            this._emit(`user_${providerUserId}`, 'booking_updated', {
                bookingId: id,
                status: 'CANCELLED',
                targetContext: 'provider',
                profileKey: 'CUSTOMER_UPDATE',
                ...providerMsg
            });

            sendPushToUser(providerUserId, {
                title: providerMsg.title,
                body: providerMsg.body
            }, {
                type: 'booking_status',
                bookingId: id,
                status: 'CANCELLED',
                targetContext: 'provider',
                isDataOnly: true
            });
        }

        // Update booking with new date/time and reset timeout/retries
        const updated = await prisma.booking.update({
            where: { id },
            data: {
                scheduledDate: new Date(scheduledDate),
                scheduledTime,
                status: 'PENDING',
                dispatchTimeoutAt: nextTimeout,
                totalRetries: { increment: 1 },
                createdAt: now // Reset creation time for fresh priority
            },
            include: {
                shop: { include: { providerProfile: true } },
                items: { include: { service: true } },
                address: true,
                user: { select: { fullName: true, remarkScore: true } }
            }
        });

        // Notify provider of new request
        this._emit(`user_${providerUserId}`, 'new_booking', {
            bookingId: updated.id,
            displayId: updated.displayId,
            targetContext: 'provider',
            profileKey: 'PROVIDER_NEW',
            title: '🔔 REQUEST RESCHEDULED!',
            body: `${updated.user?.fullName || 'Customer'} has sent a new request for ${updated.items?.[0]?.service?.name || 'a service'} at ${updated.scheduledTime}.`,
            totalAmount: updated.totalAmount,
            userName: updated.user?.fullName || 'Customer',
            userRemarkScore: updated.user?.remarkScore || 0,
            address: updated.address?.address,
            latitude: updated.address?.latitude,
            longitude: updated.address?.longitude,
            servicesList: updated.items?.map(item => ({
                name: item.service?.name,
                image: item.service?.image,
                price: item.price,
                quantity: item.quantity,
                metadata: item.metadata
            })),
            itemCount: updated.items?.length,
            scheduledTime: updated.scheduledTime,
            scheduledDate: updated.scheduledDate,
            createdAt: updated.createdAt
        });

        sendPushToUser(providerUserId, {
            title: '🔔 Booking Rescheduled!',
            body: `${updated.user?.fullName || 'A customer'} rescheduled the booking to ${new Date(updated.scheduledDate).toLocaleDateString()} ${updated.scheduledTime}.`
        }, {
            type: 'new_booking',
            bookingId: updated.id,
            shopId: updated.shopId,
            targetContext: 'provider'
        });

        return this._processBooking(updated);
    }

    /**
     * Retry an EXPIRED booking (On-Demand)
     */
    async retryBooking(id, userId) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { user: { select: { fullName: true } } }
        });

        if (!booking) throw new Error('Booking not found');
        if (booking.userId !== userId) throw new Error('Unauthorized');
        if (booking.status !== 'EXPIRED') throw new Error('Only expired bookings can be retried');

        const retryLimit = await this.getGlobalSetting('BOOKING_RETRY_LIMIT', 3);
        if (booking.totalRetries >= retryLimit) {
            throw new Error(`Maximum retry limit (${retryLimit}) reached for this booking.`);
        }

        const now = new Date();
        const acceptTimeout = await this.getGlobalSetting('ACCEPT_TIMEOUT_MIN', CONFIG.ACCEPT_TIMEOUT_MIN);
        const nextTimeout = new Date(now.getTime() + acceptTimeout * 60 * 1000);

        // Find the next set of providers (excluding current ones or just restarting the cycle)
        // Simplified: Just reset the state and find fresh potential providers or restart queue
        const updated = await prisma.booking.update({
            where: { id },
            data: {
                status: 'PENDING',
                dispatchTimeoutAt: nextTimeout,
                currentProviderIndex: 0,
                totalRetries: { increment: 1 },
                createdAt: now // Reset creation time for fresh priority
            },
            include: {
                shop: { include: { providerProfile: true } },
                items: { include: { service: true } },
                address: true,
                user: { select: { fullName: true, remarkScore: true } }
            }
        });

        // Notify first provider
        const providerUserId = updated.shop.providerProfile.userId;
        this._emit(`user_${providerUserId}`, 'new_booking', {
            bookingId: updated.id,
            displayId: updated.displayId,
            targetContext: 'provider',
            profileKey: 'PROVIDER_NEW',
            title: '🔔 NEW REQUEST!',
            body: `New request received for ${updated.user?.fullName || 'a service'}.`,
            totalAmount: updated.totalAmount,
            userName: updated.user?.fullName || 'Customer',
            userRemarkScore: updated.user?.remarkScore || 0,
            address: updated.address?.address,
            latitude: updated.address?.latitude,
            longitude: updated.address?.longitude,
            servicesList: updated.items?.map(item => ({
                name: item.service?.name,
                image: item.service?.image,
                price: item.price,
                quantity: item.quantity,
                metadata: item.metadata
            })),
            itemCount: updated.items?.length,
            scheduledTime: updated.scheduledTime,
            scheduledDate: updated.scheduledDate,
            createdAt: updated.createdAt
        });

        return updated;
    }
}

module.exports = new BookingService();
