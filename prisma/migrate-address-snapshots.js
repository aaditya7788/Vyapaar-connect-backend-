const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
    console.log('🚀 Starting Address Metadata Migration...');
    
    try {
        const bookings = await prisma.booking.findMany({
            include: {
                address: true
            }
        });

        const toUpdate = bookings.filter(b => !b.addressData && b.address);
        console.log(`📦 Found ${toUpdate.length} bookings to migrate.`);

        for (const booking of toUpdate) {
            await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    addressData: booking.address
                }
            });
            process.stdout.write('.');
        }

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
