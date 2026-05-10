const prisma = require('../../../db');
const { sendPushToUser } = require('./booking.notification');

/**
 * Robust helper to combine Date and Time strings into a single DateTime object.
 * Re-implemented from booking.service.js to avoid circular dependencies.
 */
function getScheduledDateTime(date, timeStr) {
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
        const isoString = `${scheduledDateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00Z`;
        return new Date(isoString);
    } catch (e) {
        return null;
    }
}

/**
 * 60-Minute Reminders
 * Finds bookings scheduled to start in ~60 minutes and notifies both parties.
 */
async function processUpcomingReminders() {
    const now = new Date();
    const rangeStart = new Date(now.getTime() + 55 * 60 * 1000); // 55 mins from now
    const rangeEnd = new Date(now.getTime() + 65 * 60 * 1000);   // 65 mins from now

    try {
        // Find bookings for TODAY that haven't sent a reminder yet
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setUTCHours(23, 59, 59, 999);

        const upcoming = await prisma.booking.findMany({
            where: {
                status: 'CONFIRMED',
                reminderSent: false,
                scheduledDate: {
                    gte: todayStart,
                    lte: todayEnd
                }
            },
            include: {
                user: { select: { fullName: true } },
                shop: { 
                    include: { 
                        providerProfile: { select: { userId: true } } 
                    } 
                },
                items: { include: { service: true }, take: 1 }
            }
        });

        for (const booking of upcoming) {
            const scheduledTime = getScheduledDateTime(booking.scheduledDate, booking.scheduledTime);
            if (!scheduledTime) continue;

            if (scheduledTime >= rangeStart && scheduledTime <= rangeEnd) {
                console.log(`⏰ [Reminder] Sending 60-min reminder for Booking ${booking.displayId}`);

                const serviceName = booking.items?.[0]?.service?.name || 'your service';
                const providerUserId = booking.shop.providerProfile.userId;

                // 1. Notify Customer
                await sendPushToUser(booking.userId, {
                    title: 'Upcoming Service! ⏰',
                    body: `Your booking for ${serviceName} is scheduled to start in 1 hour.`
                }, {
                    type: 'booking_reminder',
                    bookingId: booking.id,
                    targetContext: 'customer'
                });

                // 2. Notify Provider
                await sendPushToUser(providerUserId, {
                    title: 'Job Starting Soon! 🛠️',
                    body: `You have a job with ${booking.user.fullName} in 1 hour. Get ready!`
                }, {
                    type: 'booking_reminder',
                    bookingId: booking.id,
                    targetContext: 'provider'
                });

                // 3. Mark as sent
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: { reminderSent: true }
                });
            }
        }
    } catch (err) {
        console.error('[ReminderService] 60-min sweep error:', err.message);
    }
}

/**
 * Morning Summary for Providers
 * Runs once a day at 8:00 AM (server time).
 */
async function processMorningSummaries() {
    const now = new Date();
    // 8:00 AM IST is 2:30 AM UTC. We check for a 5-minute window to ensure it's hit but not duplicated (though the loop handles frequency)
    if (now.getUTCHours() !== 2 || now.getUTCMinutes() !== 30) return;

    console.log('🌅 [Reminder] Running Morning Summary Sweep...');

    try {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setUTCHours(23, 59, 59, 999);

        const providers = await prisma.providerProfile.findMany({
            where: { isActive: true },
            include: { 
                shops: {
                    include: {
                        bookings: {
                            where: {
                                status: 'CONFIRMED',
                                scheduledDate: {
                                    gte: todayStart,
                                    lte: todayEnd
                                }
                            }
                        }
                    }
                }
            }
        });

        for (const provider of providers) {
            let totalJobs = 0;
            provider.shops.forEach(s => totalJobs += s.bookings.length);

            if (totalJobs > 0) {
                await sendPushToUser(provider.userId, {
                    title: 'Good Morning! 🌅',
                    body: `You have ${totalJobs} job${totalJobs > 1 ? 's' : ''} scheduled for today. Have a great day!`
                }, {
                    type: 'morning_summary',
                    targetContext: 'provider'
                });
            }
        }
    } catch (err) {
        console.error('[ReminderService] Morning summary error:', err.message);
    }
}

/**
 * Main loop: Check every minute
 */
function initReminderService() {
    console.log('🚀 [ReminderService] Background worker initialized.');
    
    // Initial run
    processUpcomingReminders();
    
    // Scheduled runs (Every 1 minute)
    setInterval(() => {
        processUpcomingReminders();
        processMorningSummaries();
    }, 60 * 1000);
}

module.exports = { initReminderService, processUpcomingReminders };
