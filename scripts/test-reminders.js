require('dotenv').config();
const prisma = require('../src/db');
const { processUpcomingReminders } = require('../src/modules/common/booking/booking.reminder');

async function testReminders() {
    console.log('🧪 Starting Reminder System Test...');

    try {
        // 1. Find a real user and shop to create a test booking
        const user = await prisma.user.findFirst();
        const shop = await prisma.shop.findFirst();

        if (!user || !shop) {
            console.error('❌ Could not find a user or shop to create a test booking.');
            return;
        }

        // 2. Calculate a time exactly 60 minutes from now
        const now = new Date();
        const testDate = new Date(now.getTime() + 60 * 60 * 1000);
        
        // Format time to HH:mm AM/PM (matching our system format)
        let hours = testDate.getUTCHours();
        const minutes = testDate.getUTCMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;

        console.log(`📅 Creating test booking for: ${testDate.toISOString().split('T')[0]} at ${timeStr}`);

        // 3. Create a test booking
        const testBooking = await prisma.booking.create({
            data: {
                displayId: `TEST-${Math.random().toString(36).substring(7).toUpperCase()}`,
                userId: user.id,
                shopId: shop.id,
                scheduledDate: new Date(testDate.setUTCHours(0,0,0,0)),
                scheduledTime: timeStr,
                status: 'CONFIRMED',
                totalAmount: 100,
                reminderSent: false
            }
        });

        console.log(`✅ Test booking created: ${testBooking.displayId}`);

        // 4. Trigger the reminder processor
        console.log('📡 Triggering Reminder Processor...');
        await processUpcomingReminders();

        // 5. Verify if it was updated
        const updated = await prisma.booking.findUnique({
            where: { id: testBooking.id }
        });

        if (updated.reminderSent) {
            console.log('🎉 SUCCESS: Reminder was processed and marked as sent!');
        } else {
            console.log('❌ FAILURE: Reminder was not sent. Check the logic or range window.');
        }

        // 6. Cleanup
        await prisma.booking.delete({ where: { id: testBooking.id } });
        console.log('🧹 Cleanup complete.');

    } catch (err) {
        console.error('💥 Test failed with error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testReminders();
