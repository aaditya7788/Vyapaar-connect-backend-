const prisma = require('../src/db');

async function main() {
  const email = '1pspvtlimited@gmail.com';
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    console.log('USER NOT FOUND');
    return;
  }

  console.log('--- USER MFA DIAGNOSTICS ---');
  console.log('Email:', user.email);
  console.log('Roles:', user.roles);
  console.log('Is Pure Admin:', user.roles.length === 1 && user.roles[0] === 'admin');
  console.log('Has Secret:', !!user.twoFactorSecret);
  console.log('Enabled:', user.twoFactorEnabled);
  console.log('----------------------------');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
