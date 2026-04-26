const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const providerId = 'ec2d67b4-4140-440a-8b28-7c6e4bda1b61';

    const booking = await prisma.booking.findFirst({
        where: { shop: { providerProfileId: providerId } },
        include: { services: true, items: true }
    });

    console.log(JSON.stringify({
        bookingId: booking?.id,
        servicesCount: booking?.services?.length,
        itemsCount: booking?.items?.length,
        services: booking?.services.map(s => s.name)
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
