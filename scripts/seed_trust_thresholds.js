const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Checking Trust Thresholds...');
    
    const settings = [
        { key: 'REMARK_THRESHOLD_AT_RISK', value: '5', label: 'Remark Threshold: Alert', description: 'Score at which a user is flagged as Alert/At Risk' },
        { key: 'REMARK_THRESHOLD_POOR', value: '10', label: 'Remark Threshold: Poor', description: 'Score at which a user is flagged as Poor/Critical' }
    ];

    for (const setting of settings) {
        const existing = await prisma.globalSettings.findUnique({
            where: { key: setting.key }
        });

        if (!existing) {
            await prisma.globalSettings.create({ data: setting });
            console.log(`Created: ${setting.key}`);
        } else {
            console.log(`Exists: ${setting.key} = ${existing.value}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
