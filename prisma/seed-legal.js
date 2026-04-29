const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = [
    {
      key: 'SUPPORT_EMAIL',
      value: 'support@vyapaarconnect.com',
      type: 'string',
      label: 'Support Email',
      description: 'Contact email shown in Help & Support section'
    },
    {
      key: 'TERMS_AND_CONDITIONS',
      value: '', // If empty, will fallback to i18n
      type: 'longtext',
      label: 'Terms and Conditions Override',
      description: 'Leave empty to use default localized terms'
    },
    {
      key: 'PRIVACY_POLICY',
      value: '', // If empty, will fallback to i18n
      type: 'longtext',
      label: 'Privacy Policy Override',
      description: 'Leave empty to use default localized policy'
    }
  ];

  console.log('🌱 Seeding Legal & Support Settings...');

  for (const setting of settings) {
    await prisma.globalSettings.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Legal & Support Settings Seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
