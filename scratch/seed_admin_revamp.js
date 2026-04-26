const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding Admin Home Revamp Data...');

    // 1. Add NEARBY_RADIUS_KM setting
    const radius = await prisma.globalSettings.upsert({
        where: { key: 'NEARBY_RADIUS_KM' },
        update: {},
        create: {
            key: 'NEARBY_RADIUS_KM',
            value: '10',
            label: 'Home Discovery Radius (KM)'
        }
    });
    console.log('✅ Global Setting: NEARBY_RADIUS_KM added.');

    // 2. Mark some categories as trending
    const categories = await prisma.category.findMany({ take: 3 });
    for (const cat of categories) {
        await prisma.category.update({
            where: { id: cat.id },
            data: { isTrending: true }
        });
        console.log(`🔥 Category "${cat.name}" marked as TRENDING.`);
    }

    // 3. Mark some subcategories as trending
    const subcategories = await prisma.subcategory.findMany({ take: 5 });
    for (const sub of subcategories) {
        await prisma.subcategory.update({
            where: { id: sub.id },
            data: { isTrending: true }
        });
        console.log(`🔥 Subcategory "${sub.name}" marked as TRENDING.`);
    }

    console.log('🏁 Admin constraints seeded successfully.');
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
