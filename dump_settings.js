const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.globalSettings.findMany({
    select: { key: true }
  });
  console.log(JSON.stringify(settings.map(s => s.key), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
