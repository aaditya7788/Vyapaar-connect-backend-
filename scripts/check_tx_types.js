const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTypes() {
  try {
    const types = await prisma.creditTransaction.findMany({
      select: { type: true },
      distinct: ['type']
    });
    console.log('Unique Transaction Types:', types);
    
    const sample = await prisma.creditTransaction.findFirst({
        where: { amount: { lt: 0 } }
    });
    console.log('Sample negative transaction:', sample);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkTypes();
