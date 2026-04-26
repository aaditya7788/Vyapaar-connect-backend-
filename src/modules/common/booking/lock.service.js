const prisma = require('../../../db');

/**
 * Service to handle temporary slot locking during checkout.
 */
class LockService {
    /**
     * Attempts to acquire a 5-minute lock on a specific shop's time slot.
     */
    async acquireLock(shopId, scheduledDate, scheduledTime, userId) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        const dateObj = new Date(scheduledDate);

        try {
            // 1. Clean up expired locks for this specific slot FIRST (Lazy cleanup)
            await prisma.slotLock.deleteMany({
                where: {
                    shopId,
                    scheduledDate: dateObj,
                    scheduledTime,
                    expiresAt: { lt: new Date() }
                }
            });

            // 2. Check if a valid booking already exists for this slot
            const existingBooking = await prisma.booking.findFirst({
                where: {
                    shopId,
                    scheduledDate: dateObj,
                    scheduledTime,
                    status: { notIn: ['CANCELLED', 'EXPIRED', 'REJECTED'] }
                }
            });

            if (existingBooking) {
                throw new Error('Slot is already booked.');
            }

            // 3. Attempt to create the lock
            // Uses DB unique constraint [shopId, scheduledDate, scheduledTime] for safety
            return await prisma.slotLock.create({
                data: {
                    shopId,
                    scheduledDate: dateObj,
                    scheduledTime,
                    userId,
                    expiresAt
                }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new Error('This slot is currently being held by another user. Please try again in a few minutes.');
            }
            throw error;
        }
    }

    /**
     * Checks if a slot is available (not locked and not booked)
     */
    async checkAvailability(shopId, scheduledDate, scheduledTime) {
        const dateObj = new Date(scheduledDate);
        const now = new Date();

        const [activeLock, activeBooking] = await Promise.all([
            prisma.slotLock.findFirst({
                where: {
                    shopId,
                    scheduledDate: dateObj,
                    scheduledTime,
                    expiresAt: { gt: now }
                }
            }),
            prisma.booking.findFirst({
                where: {
                    shopId,
                    scheduledDate: dateObj,
                    scheduledTime,
                    status: { notIn: ['CANCELLED', 'EXPIRED', 'REJECTED'] }
                }
            })
        ]);

        return !activeLock && !activeBooking;
    }

    /**
     * Explicitly release a lock (e.g., after booking is completed or cart is cleared)
     */
    async releaseLock(shopId, scheduledDate, scheduledTime, userId) {
        try {
            await prisma.slotLock.deleteMany({
                where: {
                    shopId,
                    scheduledDate: new Date(scheduledDate),
                    scheduledTime,
                    userId
                }
            });
        } catch (error) {
            console.error('[LockService] Release failed:', error);
        }
    }
}

module.exports = new LockService();
