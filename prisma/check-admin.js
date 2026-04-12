const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  console.log('Recent Users:');
  users.forEach(u => {
    console.log(`- ${u.id}: ${u.phoneNumber} (Roles: ${JSON.stringify(u.roles)})`);
  });

  // Promote all existing users to include ADMIN for testing if needed, 
  // or just identify the one in the log.
  // For now, let's just log them.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
