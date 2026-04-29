const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Trust & Safety Settings...');

  const settings = [
    {
      key: 'REMARK_SAFETY_THRESHOLD',
      value: '5',
      label: 'Safety Risk Threshold',
      description: 'Remark score at which a user/provider is flagged as a Safety Risk'
    },
    {
      key: 'REMARK_PENALTY_FACTOR',
      value: '0.2',
      label: 'Remark Ranking Penalty',
      description: 'Stars deduction per weight point in search ranking'
    },
    {
      key: 'REMARK_COOLDOWN_HOURS',
      value: '24',
      label: 'Report Cooldown (Hours)',
      description: 'Hours before a user can report the same target again. Set 0 for One-Time only.'
    },
    {
      key: 'REMARK_DISTANCE_PENALTY',
      value: '5',
      label: 'Nearby Distance Penalty (KM)',
      description: 'Virtual kilometers added to distance per remark weight point'
    }
  ];

  for (const s of settings) {
    await prisma.globalSettings.upsert({
      where: { key: s.key },
      update: { label: s.label },
      create: s
    });
  }

  console.log('✅ Settings seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
