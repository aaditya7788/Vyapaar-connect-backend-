const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { displayId: null }
  });

  console.log(`Found ${bookings.length} bookings to update.`);

  for (const booking of bookings) {
    const displayId = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await prisma.booking.update({
      where: { id: booking.id },
      data: { displayId }
    });
    console.log(`Updated booking ${booking.id} with displayId ${displayId}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
