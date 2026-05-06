const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const key = 'CANCEL_WINDOW_HOURS';
    const existing = await prisma.globalSettings.findUnique({ where: { key } });

    if (!existing) {
        await prisma.globalSettings.create({
            data: {
                key,
                value: '24',
                type: 'number',
                label: 'Booking Cancellation Window (Hours)',
                description: 'Hours before scheduled time when customer can no longer cancel a confirmed booking'
            }
        });
        console.log(`✅ Added setting: ${key}`);
    } else {
        console.log(`ℹ️ Setting already exists: ${key}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
