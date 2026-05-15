const prisma = require('../src/db');

async function main() {
  const email = '1pspvtlimited@gmail.com';
  await prisma.user.update({
    where: { email },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null
    }
  });
  console.log('MFA RESET SUCCESSFUL for', email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
