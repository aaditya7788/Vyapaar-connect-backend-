const prisma = require('../src/db');

async function main() {
    console.log('--- Phase 6.2 Initialization: Credits ---');
    const users = await prisma.user.findMany({
        where: { credits: null }
    });

    console.log(`Found ${users.length} users requiring wallet initialization.`);

    for (const user of users) {
        await prisma.userCredits.create({
            data: {
                userId: user.id,
                balance: 0
            }
        });
        console.log(`Initialized wallet for user: ${user.phone}`);
    }

    console.log('--- Initialization Complete ---');
    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
