const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testControllerQuery(id) {
    const creditSpendStats = await prisma.creditOrder.aggregate({
        where: { userId: id, status: 'paid' },
        _sum: { amount: true }
    });
    console.log('Credit Spend Stats:', creditSpendStats);

    const coinPurchaseStats = await prisma.creditTransaction.aggregate({
        where: { userId: id, type: 'PURCHASE', amount: { gt: 0 }, status: 'SUCCESS' },
        _sum: { amount: true }
    });
    console.log('Coin Purchase Stats:', coinPurchaseStats);
}

testControllerQuery('fa3190b5-522a-4d9b-8af6-2f8972cc90a9')
    .finally(() => prisma.$disconnect());
