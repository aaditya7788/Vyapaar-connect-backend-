const prisma = require('../../../db');

/**
 * SlotService — Core slot generation engine.
 * Produces an ordered list of time blocks for a given shop + date,
 * marking each as: available | full | break
 */
class SlotService {
    /**
     * Generate HH:mm string from total minutes.
     */
    _minutesToTime(minutes) {
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    /**
     * Parse "HH:mm" to total minutes from midnight.
     */
    _timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1] || '0', 10);
        return h * 60 + m;
    }

    /**
     * Convert "09:00 AM" or "06:00 PM" to "09:00" or "18:00"
     */
    _format12to24(time12h) {
        if (!time12h) return null;
        // Handle "9:30 AM" or "9 AM"
        const [timePart, modifier] = time12h.split(' ');
        const timeParts = timePart.split(':');
        let hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1] || '0', 10);

        if (modifier === 'PM' && hours < 12) {
            hours += 12;
        } else if (modifier === 'AM' && hours === 12) {
            hours = 0;
        }
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Convert "13:00" to "01:00 PM"
     */
    _format24to12(time24h) {
        if (!time24h) return "";
        const [h, m] = time24h.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    /**
     * Core engine: generates all time slots for a (shopId, date) pair.
     */
    async getAvailableSlots(shopId, date) {
        const parsedDate = new Date(date);
        const dayOfWeek = parsedDate.getUTCDay();
        const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const currentDayStr = daysMap[dayOfWeek];

        // 0. Fetch Shop defaults
        const shop = await prisma.shop.findUnique({
            where: { id: shopId },
            select: { workingDays: true, workingHoursStart: true, workingHoursEnd: true }
        });

        if (!shop) throw new Error('Shop not found');

        // Check if day is a holiday
        const isWorkingDay = shop.workingDays.includes(currentDayStr);
        if (!isWorkingDay) {
            return { isClosed: true, slots: [] };
        }

        // 1. Fetch configs: Specific Date takes precedence over Weekly Day
        const startOfDate = new Date(`${date}T00:00:00.000Z`);
        const endOfDate = new Date(`${date}T23:59:59.999Z`);

        let allConfigs = await prisma.shopSlotConfig.findMany({
            where: { 
                shopId,
                isActive: true,
                OR: [
                    { date: { gte: startOfDate, lte: endOfDate } },
                    { dayOfWeek, date: null }
                ]
            },
            orderBy: { startTime: 'asc' },
        });

        // If we have specific date configs, they completely override weekly rules for that day
        const specificDateConfigs = allConfigs.filter(c => c.date !== null);
        if (specificDateConfigs.length > 0) {
            allConfigs = specificDateConfigs;
        }

        // 2. Fallback to Shop working hours
        if (allConfigs.length === 0) {
            const start24 = this._format12to24(shop.workingHoursStart || '09:00 AM');
            const end24 = this._format12to24(shop.workingHoursEnd || '06:00 PM');
            
            if (start24 && end24) {
                allConfigs = [{
                    startTime: start24,
                    endTime: end24,
                    slotDuration: 60,
                    maxBookings: 1,
                    isBreak: false
                }];
            }
        }

        if (allConfigs.length === 0) return { isClosed: false, slots: [] };

        const breaks = allConfigs.filter(c => c.isBreak);
        const activeWindows = allConfigs.filter(c => !c.isBreak);

        if (activeWindows.length === 0) return { isClosed: false, slots: [] };

        // 3. Fetch existing bookings
        const existingBookings = await prisma.booking.findMany({
            where: {
                shopId,
                scheduledDate: { gte: startOfDate, lte: endOfDate },
                status: { notIn: ['CANCELLED', 'DECLINED', 'EXPIRED'] },
            },
            select: { scheduledTime: true },
        });

        const bookingCountByTime = {};
        for (const b of existingBookings) {
            if (b.scheduledTime) {
                bookingCountByTime[b.scheduledTime] = (bookingCountByTime[b.scheduledTime] || 0) + 1;
            }
        }

        // 4. Generate slots
        const slots = [];
        for (const window of activeWindows) {
            const windowStart = this._timeToMinutes(window.startTime);
            const windowEnd = this._timeToMinutes(window.endTime);
            const duration = window.slotDuration;

            for (let t = windowStart; t + duration <= windowEnd; t += duration) {
                const slotStart = this._minutesToTime(t);
                const slotEnd = this._minutesToTime(t + duration);

                const isBreak = breaks.some(b => {
                    const bStart = this._timeToMinutes(b.startTime);
                    const bEnd = this._timeToMinutes(b.endTime);
                    return t < bEnd && (t + duration) > bStart;
                });

                if (isBreak) {
                    const matchingBreak = breaks.find(b => {
                        const bStart = this._timeToMinutes(b.startTime);
                        const bEnd = this._timeToMinutes(b.endTime);
                        return t < bEnd && (t + duration) > bStart;
                    });
                    slots.push({
                        time: slotStart,
                        endTime: slotEnd,
                        displayRange: `${this._format24to12(slotStart)} - ${this._format24to12(slotEnd)}`,
                        displayTime: this._format24to12(slotStart),
                        status: 'break',
                        label: matchingBreak?.label || 'Unavailable',
                        remaining: 0,
                        maxBookings: 0,
                    });
                    continue;
                }

                const booked = bookingCountByTime[slotStart] || 0;
                const remaining = Math.max(0, window.maxBookings - booked);

                slots.push({
                    time: slotStart,
                    endTime: slotEnd,
                    displayRange: `${this._format24to12(slotStart)} - ${this._format24to12(slotEnd)}`,
                    displayTime: this._format24to12(slotStart),
                    status: remaining > 0 ? 'available' : 'full',
                    remaining,
                    maxBookings: window.maxBookings,
                });
            }
        }

        return { isClosed: false, slots };
    }

    /**
     * Get all slot configs for a shop (for management UI).
     */
    async getShopConfig(shopId) {
        return prisma.shopSlotConfig.findMany({
            where: { shopId },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
    }

    /**
     * Save multiple slot configs in a single transaction.
     */
    async bulkUpsertConfigs(shopId, configs) {
        return await prisma.$transaction(
            configs.map((config) => {
                const { id, dayOfWeek, date, startTime, endTime, slotDuration, maxBookings, isBreak, isActive, label } = config;
                if (id) {
                    return prisma.shopSlotConfig.update({
                        where: { id },
                        data: { dayOfWeek, date, startTime, endTime, slotDuration, maxBookings, isBreak, isActive, label },
                    });
                }
                return prisma.shopSlotConfig.create({
                    data: { 
                        shopId, 
                        dayOfWeek, 
                        date: date ? new Date(date) : null,
                        startTime, 
                        endTime, 
                        slotDuration: slotDuration || 60, 
                        maxBookings: maxBookings || 1, 
                        isBreak: isBreak || false, 
                        isActive: isActive ?? true,
                        label 
                    },
                });
            })
        );
    }

    /**
     * Save slot config for a shop + day (upserts the record).
     */
    async upsertConfig(shopId, config) {
        const { id, dayOfWeek, date, startTime, endTime, slotDuration, maxBookings, isBreak, isActive, label } = config;

        if (id) {
            return prisma.shopSlotConfig.update({
                where: { id },
                data: { dayOfWeek, date, startTime, endTime, slotDuration, maxBookings, isBreak, isActive, label },
            });
        }

        return prisma.shopSlotConfig.create({
            data: { 
                shopId, 
                dayOfWeek, 
                date: date ? new Date(date) : null,
                startTime, 
                endTime, 
                slotDuration: slotDuration || 60, 
                maxBookings: maxBookings || 1, 
                isBreak: isBreak || false, 
                isActive: isActive ?? true,
                label 
            },
        });
    }

    /**
     * Delete a slot config entry.
     */
    async deleteConfig(id, shopId) {
        // Ensure the config belongs to this shop before deleting
        const config = await prisma.shopSlotConfig.findFirst({ where: { id, shopId } });
        if (!config) throw new Error('Config not found or unauthorized');
        return prisma.shopSlotConfig.delete({ where: { id } });
    }
}

module.exports = new SlotService();
