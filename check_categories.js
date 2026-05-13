const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- CHECKING CATEGORY FIELDS ---');
    const categories = await prisma.category.findMany({ take: 1 });
    if (categories.length > 0) {
        console.log('Available keys in Category object:', Object.keys(categories[0]));
        console.log('Full Category data:', JSON.stringify(categories[0], null, 2));
    } else {
        console.log('No categories found.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
