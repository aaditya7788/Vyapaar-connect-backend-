const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultUnits = [
    'pcs', 'kg', 'gm', 'ltr', 'ml', 'packet', 'plate', 'hour', 'session', 
    'set', 'strip', 'box', 'unit', 'bundle', 'dozen', 'meter', 'square foot'
];

async function main() {
    console.log('Seeding verified service units...');
    
    for (const unit of defaultUnits) {
        await prisma.serviceUnit.upsert({
            where: { name: unit },
            update: { isVerified: true },
            create: { name: unit, isVerified: true }
        });
    }
    
    console.log('Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
