const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMetadata() {
  try {
    const purchase = await prisma.creditTransaction.findFirst({
      where: { type: 'PURCHASE' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Purchase Transaction:', JSON.stringify(purchase, null, 2));
    
    if (purchase && purchase.orderId) {
        const order = await prisma.creditOrder.findUnique({
            where: { id: purchase.orderId }
        });
        console.log('Associated Order:', JSON.stringify(order, null, 2));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkMetadata();
