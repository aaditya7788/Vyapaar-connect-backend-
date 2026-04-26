const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetProfileId = '59d2e793-d299-412a-a3e8-1fd7eaedbe1c'; // Aaditya's profile
    const oldProfileId = 'dbe567da-77c4-47db-9719-c21da72df8d0';

    const result = await prisma.shop.updateMany({
        where: { providerProfileId: oldProfileId },
        data: { providerProfileId: targetProfileId }
    });

    console.log(`Successfully moved ${result.count} shops to Aaditya's profile.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
