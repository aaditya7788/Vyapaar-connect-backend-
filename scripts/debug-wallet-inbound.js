const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugUserWallet(userId) {
    const orders = await prisma.creditOrder.findMany({ where: { userId } });
    console.log('--- Orders ---');
    console.table(orders.map(o => ({ status: o.status, amount: o.amount })));

    const txs = await prisma.creditTransaction.findMany({ 
        where: { userId, type: { in: ['PURCHASE', 'BONUS'] } } 
    });
    console.log('--- Credit Transactions (Inbound) ---');
    console.table(txs.map(t => ({ type: t.type, amount: t.amount, status: t.status })));
}

debugUserWallet('fa3190b5-522a-4d9b-8af6-2f8972cc90a9')
    .finally(() => prisma.$disconnect());
