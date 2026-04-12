const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateLegacyCommunityIds() {
    console.log('🔄 Starting Community ID Migration...');
    
    try {
        // 1. Get all shops
        const shops = await prisma.shop.findMany();
        console.log(`🔍 Scanning ${shops.length} shops for legacy identifiers...`);

        let updatedCount = 0;

        for (const shop of shops) {
            const id = shop.communityId;
            if (!id || id === 'null') continue;
            
            // Check if it's NOT a UUID
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            
            if (!isUUID) {
                console.log(`🛠️ Migrated shop "${shop.name}" legacy identifier: "${id}"`);

                const community = await prisma.community.findUnique({
                    where: { slug: id.toLowerCase() }
                });

                if (community) {
                    await prisma.shop.update({
                        where: { id: shop.id },
                        data: { communityId: community.id }
                    });
                    updatedCount++;
                    console.log(`✅ Successfully updated to: ${community.id}`);
                }
            }
        }

        console.log(`✨ Migration Complete. Updated ${updatedCount} shops.`);
    } catch (error) {
        console.error('❌ Migration Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

migrateLegacyCommunityIds();
