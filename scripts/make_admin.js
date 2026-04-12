const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- ELEVATING ALL USERS TO ADMIN (DEVELOPMENT ONLY) ---');
    
    const users = await prisma.user.findMany();
    
    for (const user of users) {
        if (!user.roles.includes('admin')) {
            console.log(`Updating user: ${user.name || user.email}`);
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    roles: {
                        set: [...user.roles, "admin"]
                    }
                }
            });
        }
    }

    console.log('--- DONE ---');
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
