require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function disableMaintenance() {
    console.log('🛡️  Vyapaar Connect: Emergency Maintenance Override');
    console.log('--------------------------------------------------');

    try {
        const setting = await prisma.globalSettings.upsert({
            where: { key: 'MAINTENANCE_MODE' },
            update: { value: 'false' },
            create: {
                key: 'MAINTENANCE_MODE',
                value: 'false',
                label: 'Global Maintenance Mode'
            }
        });

        console.log('✅ SUCCESS: Maintenance Mode has been turned OFF.');
        console.log('📱 All mobile users can now access the app again.');
    } catch (err) {
        console.error('❌ FAILED: Could not update database.', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

disableMaintenance();

