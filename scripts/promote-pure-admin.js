const prisma = require('../src/db');

async function main() {
  const email = '1pspvtlimited@gmail.com';
  await prisma.user.update({
    where: { email },
    data: {
      roles: ['admin']
    }
  });
  console.log('PROMOTED TO PURE ADMIN SUCCESSFUL for', email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
