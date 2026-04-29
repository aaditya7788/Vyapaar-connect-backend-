const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.globalSettings.findMany();
  console.log("Global Settings:", JSON.stringify(settings, null, 2));
}

main().finally(() => prisma.$disconnect());
