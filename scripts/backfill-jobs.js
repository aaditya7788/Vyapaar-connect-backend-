const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillJobsCompleted() {
    console.log('🚀 Starting backfill for jobsCompleted...');
    
    try {
        // 1. Get all shops
        const shops = await prisma.shop.findMany();
        console.log(`Found ${shops.length} shops to process.`);

        for (const shop of shops) {
            // 2. Count completed bookings for this shop
            const completedCount = await prisma.booking.count({
                where: {
                    shopId: shop.id,
                    status: 'COMPLETED'
                }
            });

            // 3. Update shop
            await prisma.shop.update({
                where: { id: shop.id },
                data: { jobsCompleted: completedCount }
            });

            console.log(`✅ Updated Shop [${shop.name}]: ${completedCount} jobs.`);
        }

        console.log('✨ Backfill completed successfully!');
    } catch (error) {
        console.error('❌ Backfill failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backfillJobsCompleted();
