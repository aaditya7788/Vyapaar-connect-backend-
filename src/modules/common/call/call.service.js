const prisma = require('../../../db');
const { generateRtcToken } = require('../../../utils/agora');
const { sendPushToUser } = require('../booking/booking.notification');

class CallService {
    /**
     * Initiate a new call session
     */
    async initiateCall(userId, { bookingId, receiverId }) {
        // 1. Verify booking exists and user is part of it
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                shop: {
                    select: { providerProfileId: true, providerProfile: { select: { userId: true } } }
                }
            }
        });

        if (!booking) throw new Error('Booking not found');

        // Allow if user is either the customer or the shop's provider
        const isCustomer = booking.userId === userId;
        const isProvider = booking.shop.providerProfile.userId === userId;

        if (!isCustomer && !isProvider) {
            throw new Error('Unauthorized to call for this booking');
        }

        // ── CALL LOCK GUARD (Timezone Aware: IST +05:30) ──
        if (!booking.isCallUnlocked) {
            try {
                const now = new Date();
                const scheduledDateStr = booking.scheduledDate.toISOString().split('T')[0];
                
                // 1. Parse Time
                let timeStr = (booking.scheduledTime || "00:00").trim();
                let hours = 0, minutes = 0;
                
                if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
                    const [time, period] = timeStr.split(' ');
                    [hours, minutes] = time.split(':').map(Number);
                    if (period.toUpperCase() === 'PM' && hours < 12) hours += 12;
                    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
                } else {
                    [hours, minutes] = timeStr.split(':').map(Number);
                }

                // 2. Construct Date in IST (+05:30)
                // We format it as a proper ISO string with the +05:30 offset
                const isoString = `${scheduledDateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00+05:30`;
                const scheduledDateTime = new Date(isoString);
                
                // 3. Unlock window (Allow 60 minutes before the slot)
                const unlockWindowStart = new Date(scheduledDateTime.getTime() - 60 * 60000);

                if (now < unlockWindowStart) {
                    const minutesLeft = Math.ceil((unlockWindowStart - now) / 60000);
                    throw new Error(`Call is locked. It will unlock in ${minutesLeft} minutes (at ${unlockWindowStart.toLocaleTimeString()}).`);
                }
            } catch (e) {
                if (e.message.includes('locked')) throw e;
                console.warn('📞 [CallService] Guard parsing skipped:', e.message);
            }
        }

        // Determine the actual receiver if not provided correctly
        const actualReceiverId = isCustomer ? booking.shop.providerProfile.userId : booking.userId;

        // 2. Create channel name (unique for this call session)
        const channelName = `call_${bookingId}_${Date.now()}`;

        // 3. Create Call record in DB
        const call = await prisma.call.create({
            data: {
                bookingId,
                callerId: userId,
                receiverId: actualReceiverId,
                channelName,
                status: 'RINGING'
            }
        });

        // 4. Generate Token
        const token = generateRtcToken(channelName, 0);

        // 5. Trigger FCM Signaling to recipient
        const caller = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });

        // We use a high-priority push to trigger the native call UI
        try {
            await sendPushToUser(actualReceiverId, {
                title: '📞 Incoming Call',
                body: `${caller.fullName || 'Someone'} is calling...`
            }, {
                type: 'VOIP_CALL',
                uuid: call.id,
                callerName: caller.fullName || 'Service Provider',
                channelName,
                token,
                skipHistory: true, // 🚀 Fix: Don't clutter notification history with calls
                zegoAppId: process.env.ZEGO_APP_ID || process.env.AGORA_APP_ID
            }, 'booking-alerts');
        } catch (fcmError) {
            console.error('📞 [CallService] Signaling failed:', fcmError.message);
        }

        return {
            callId: call.id,
            channelName,
            token,
            zegoAppId: process.env.ZEGO_APP_ID || process.env.AGORA_APP_ID
        };
    }

    /**
     * Update call status (End call)
     */
    async updateCallStatus(callId, status, duration = null) {
        return prisma.call.update({
            where: { id: callId },
            data: {
                status,
                endTime: ['COMPLETED', 'MISSED', 'REJECTED'].includes(status) ? new Date() : undefined,
                duration
            }
        });
    }

    /**
     * Get call by ID
     */
    async getCallById(id) {
        return prisma.call.findUnique({
            where: { id },
            include: { booking: true }
        });
    }

    /**
     * Unlock call early for 10 credits
     */
    async unlockCall(bookingId, userId) {
        // 1. Verify booking and role
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                shop: {
                    select: { 
                        providerProfile: { select: { userId: true } } 
                    }
                }
            }
        });

        if (!booking) throw new Error('Booking not found');
        
        // Security check: Only the actual provider for this shop can unlock
        if (booking.shop.providerProfile.userId !== userId) {
            throw new Error('Only the provider for this booking can early unlock calls');
        }

        if (booking.isCallUnlocked) {
            return booking;
        }

        // ── DYNAMIC FEE FETCH ──
        const chargeSetting = await prisma.globalSettings.findUnique({ where: { key: 'early_call_charge_coin' } });
        const unlockFee = parseInt(chargeSetting?.value || '10');

        // 2. Check credits
        const credits = await prisma.userCredits.findUnique({ where: { userId } });
        if (!credits || credits.balance < unlockFee) {
            throw new Error(`Insufficient credits. ${unlockFee} coins required for early unlock.`);
        }

        // 3. Execute Transaction
        return await prisma.$transaction(async (tx) => {
            // Deduct credits
            await tx.userCredits.update({
                where: { userId },
                data: { balance: { decrement: unlockFee } }
            });

            // Log debit transaction
            await tx.creditTransaction.create({
                data: {
                    userId,
                    amount: unlockFee,
                    type: 'DEBIT',
                    description: `Early call unlock for Booking #${booking.displayId || booking.id.substring(0,8)}`,
                    bookingId: booking.id,
                    status: 'SUCCESS',
                    metadata: { action: 'CALL_EARLY_UNLOCK', coins: unlockFee }
                }
            });

            // Update booking status
            const updatedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: { isCallUnlocked: true }
            });

            // 4. Emit Socket Event for real-time sync (Phase Sync)
            try {
                const { getIO } = require('../../../utils/socket');
                const io = getIO();
                
                // Notify both customer and provider rooms
                const targetRooms = [`user_${updatedBooking.userId}`, `user_${userId}`];
                targetRooms.forEach(room => {
                    io.to(room).emit('booking_updated', {
                        bookingId: updatedBooking.id,
                        status: updatedBooking.status,
                        isCallUnlocked: true
                    });
                });
                console.log(`📡 [CallService] Call unlock synced via socket for booking: ${bookingId}`);
            } catch (socketError) {
                console.error('📡 [CallService] Socket sync failed:', socketError.message);
            }

            return updatedBooking;
        });
    }
}

module.exports = new CallService();
