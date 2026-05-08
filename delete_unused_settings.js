const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.globalSettings.deleteMany({
    where: {
      key: {
        in: ['BOOKING_EXPIRE_TIME', 'BOOKING_TTL_MINS', 'BOOKING_ALERT_DURATION', 'BOOKING_ALERT_REPEAT']
      }
    }
  });
  console.log(`Deleted ${deleted.count} settings.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
