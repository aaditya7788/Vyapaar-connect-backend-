const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = '1pspvtlimited@gmail.com';
  
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      roles: ['admin', 'customer'],
      status: 'active'
    },
    create: {
      email,
      fullName: 'Super Admin',
      roles: ['admin', 'customer'],
      status: 'active',
      phone: `admin_${Date.now()}`,
      customerId: `CUST-${Date.now()}`
    }
  });

  console.log(`✅ User ${email} is now a Super Admin.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
