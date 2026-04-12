const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Credit Plans...');
  
  const plans = [
    {
      credits: 50,
      price: 199,
      label: 'Starter Pack',
      popular: false,
      savings: '0%',
      validityDays: 365,
      isActive: true
    },
    {
      credits: 100,
      price: 349,
      label: 'Most Popular',
      popular: true,
      savings: '12%',
      validityDays: 365,
      isActive: true
    },
    {
      credits: 250,
      price: 799,
      label: 'Value Pack',
      popular: false,
      savings: '20%',
      validityDays: 365,
      isActive: true
    }
  ];

  for (const plan of plans) {
    await prisma.creditPlan.upsert({
      where: { id: plan.label.replace(/\s+/g, '-').toLowerCase() }, // Dummy ID for upsert
      update: plan,
      create: {
        ...plan,
        id: plan.label.replace(/\s+/g, '-').toLowerCase()
      }
    });
  }

  console.log('Seeding Sample Coupons...');
  const coupons = [
    {
      code: 'WELCOME50',
      type: 'PERCENT',
      discount: 50,
      minAmount: 100,
      isActive: true
    },
    {
      code: 'BONUS10',
      type: 'FIXED',
      discount: 10,
      minAmount: 50,
      isActive: true
    }
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: coupon,
      create: coupon
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
