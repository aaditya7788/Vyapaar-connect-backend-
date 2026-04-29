const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const termsJSON = JSON.stringify([
    {
      title: "1. Acceptance of Terms",
      content: "By accessing or using Vyapaar Connect, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the service."
    },
    {
      title: "2. Service Description",
      content: "Vyapaar Connect is a platform connecting customers with local service providers. We act as a facilitator and are not responsible for the direct execution of services unless stated."
    },
    {
      title: "3. User Accounts",
      content: "You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account."
    },
    {
      title: "4. Provider Obligations",
      content: "Providers must provide accurate information about their services, pricing, and availability. Any fraudulent activity will result in immediate termination of the account."
    },
    {
      title: "5. Limitation of Liability",
      content: "Vyapaar Connect shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use our services."
    }
  ]);

  const privacyJSON = JSON.stringify([
    {
      title: "1. Information Collection",
      content: "We collect information you provide directly to us, such as when you create an account, request a service, or contact support. This includes name, phone number, and location data."
    },
    {
      title: "2. How We Use Information",
      content: "We use your information to provide, maintain, and improve our services, facilitate connections between users, and send you technical notices or support messages."
    },
    {
      title: "3. Information Sharing",
      content: "We share your information with providers to facilitate bookings. We do not sell your personal data to third parties for marketing purposes."
    },
    {
      title: "4. Data Security",
      content: "We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure."
    },
    {
      title: "5. Your Rights",
      content: "You have the right to access, correct, or delete your personal information at any time through your profile settings or by contacting our support team."
    }
  ]);

  const settings = [
    {
      key: 'TERMS_AND_CONDITIONS',
      value: termsJSON,
    },
    {
      key: 'PRIVACY_POLICY',
      value: privacyJSON,
    }
  ];

  console.log('📜 Seeding Default Legal Policies...');

  for (const setting of settings) {
    await prisma.globalSettings.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { 
        key: setting.key, 
        value: setting.value,
        type: 'longtext',
        label: setting.key === 'TERMS_AND_CONDITIONS' ? 'Terms & Conditions' : 'Privacy Policy'
      },
    });
  }

  console.log('✅ Default Legal Policies Seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
