const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProvider() {
    const userId = 'e8dde226-2ef7-49c1-be60-f28e80bd2f9a';
    const profile = await prisma.providerProfile.findUnique({
        where: { userId },
        include: {
            shops: true
        }
    });

    console.log('Profile ID:', profile.id);
    console.log('Shops count:', profile.shops.length);
    for (const shop of profile.shops) {
        const total = await prisma.booking.count({ where: { shopId: shop.id } });
        const completed = await prisma.booking.count({ where: { shopId: shop.id, status: 'COMPLETED' } });
        console.log(`Shop: ${shop.name} (${shop.id}) | Total: ${total} | Completed: ${completed}`);
    }
}

checkProvider().catch(console.error).finally(() => prisma.$disconnect());
