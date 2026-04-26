const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkShopStats() {
    const shopId = 'c18a392f-0aa2-48b5-ba4f-d68103afef1c';
    
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: {
            providerProfile: true
        }
    });

    if (!shop) {
        console.log('Shop not found');
        return;
    }

    const totalJobsCount = await prisma.booking.count({
        where: { shopId },
    });

    const completedJobsCount = await prisma.booking.count({
        where: {
            shopId,
            status: 'COMPLETED',
        },
    });

    console.log('--- DB STATS ---');
    console.log('Shop ID:', shopId);
    console.log('Rating:', shop.averageRating);
    console.log('Review Count:', shop.reviewCount);
    console.log('Total Jobs:', totalJobsCount);
    console.log('Completed Jobs:', completedJobsCount);
    console.log('----------------');
}

checkShopStats()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
