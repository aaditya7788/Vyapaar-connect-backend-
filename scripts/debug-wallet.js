const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugUserWallet(userId) {
    console.log('--- Debugging Wallet for User:', userId, '---');
    
    const orders = await prisma.creditOrder.findMany({
        where: { userId }
    });
    console.log('\nCredit Orders:');
    console.table(orders.map(o => ({ id: o.id, amount: o.amount, status: o.status, razorpayId: o.razorpayOrderId })));
    
    const transactions = await prisma.creditTransaction.findMany({
        where: { userId }
    });
    console.log('\nCredit Transactions:');
    console.table(transactions.map(t => ({ id: t.id, amount: t.amount, type: t.type, status: t.status, desc: t.description })));
    
    const wallet = await prisma.userCredits.findUnique({
        where: { userId }
    });
    console.log('\nWallet Balance:', wallet?.balance);
}

const targetUserId = process.argv[2] || 'fa3190b5-522a-4d9b-8af6-2f8972cc90a9';
debugUserWallet(targetUserId)
    .catch(console.error)
    .finally(() => prisma.$disconnect());
