const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookingItems() {
  try {
    const booking = await prisma.booking.findFirst({
      where: { displayId: 'BK-ACRXXGCF' },
      include: {
        bookingItems: {
          include: {
            service: true
          }
        }
      }
    });
    console.log('Booking found:', JSON.stringify(booking, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookingItems();
