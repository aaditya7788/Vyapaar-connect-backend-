const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAnyBooking() {
  try {
    const booking = await prisma.booking.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    console.log('Last Booking:', JSON.stringify(booking, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

findAnyBooking();
