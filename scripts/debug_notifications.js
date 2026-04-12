const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTokens() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, phone: true, roles: true }
        });
        console.log('Total Users:', users.length);
        users.forEach(u => {
            console.log(`User ${u.id} (${u.phone}): Roles = ${JSON.stringify(u.roles)}`);
        });

        const tokens = await prisma.pushToken.findMany({
            include: { user: { select: { phone: true, roles: true } } }
        });
        console.log('\nTotal Push Tokens:', tokens.length);
        tokens.forEach(t => {
            console.log(`Token: ${t.token.substring(0, 20)}... | User: ${t.user.phone} | Roles: ${JSON.stringify(t.user.roles)}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkTokens();
