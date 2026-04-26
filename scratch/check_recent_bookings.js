const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookings() {
    const shopId = 'c18a392f-0aa2-48b5-ba4f-d68103afef1c';
    const bookings = await prisma.booking.findMany({
        where: { shopId },
        orderBy: { updatedAt: 'desc' },
        take: 5
    });

    console.log('Recent bookings for shop:', shopId);
    bookings.forEach(b => {
        console.log(`ID: ${b.id} | Status: ${b.status} | Amount: ${b.totalAmount} | UpdatedAt: ${b.updatedAt}`);
    });
}

checkBookings().catch(console.error).finally(() => prisma.$disconnect());
