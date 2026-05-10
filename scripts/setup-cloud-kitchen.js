const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = "aadityasahani78@gmail.com";
    console.log(`🔍 Searching for user: ${email}...`);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { providerProfile: true }
    });

    if (!user) {
        console.error("❌ User not found!");
        return;
    }

    console.log(`✅ Found user: ${user.fullName} (${user.id})`);

    // 1. Ensure user is a provider
    if (!user.roles.includes('provider')) {
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                roles: [...user.roles, 'provider'],
                isProfileComplete: true
            }
        });
        console.log("🆙 User promoted to PROVIDER role.");
    }

    // 2. Ensure ProviderProfile exists
    let profileId = user.providerProfile?.id;
    if (!profileId) {
        const newProfile = await prisma.providerProfile.create({
            data: { userId: user.id }
        });
        profileId = newProfile.id;
        console.log("🏢 Created Provider Profile.");
    }

    // 3. Find Daily Menu Categories
    const categories = await prisma.category.findMany({
        where: { supportsDailyMenu: true },
        include: { subcategories: true }
    });

    if (categories.length === 0) {
        console.log("⚠️ No categories found with 'supportsDailyMenu: true'. Please enable one first.");
        return;
    }

    for (const cat of categories) {
        console.log(`📁 Processing Category: ${cat.name}`);

        // Find Cloud Kitchen subcategory or take the first one
        const sub = cat.subcategories.find(s => s.name.toLowerCase().includes('cloud') || s.name.toLowerCase().includes('kitchen')) || cat.subcategories[0];
        
        const subName = sub ? sub.name : "General";

        // 4. Create Shop
        const shop = await prisma.shop.create({
            data: {
                name: `${cat.name} Delights`,
                address: "Runwal Gardens, Phase 1, Dombivli East",
                area: "Runwal Gardens",
                providerProfileId: profileId,
                status: "APPROVED",
                category: cat.name,
                subcategories: [subName],
                businessSummary: `Premium ${cat.name} service specialized in ${subName}.`,
                workingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                workingHoursStart: "08:00 AM",
                workingHoursEnd: "10:00 PM",
                communityType: "runwal",
                latitude: 19.1678,
                longitude: 73.1092,
                profileImage: "/uploads/shared/shops/cloud_kitchen_default.png"
            }
        });

        console.log(`🏪 Created Shop: ${shop.name}`);

        // 5. Create Daily Menu Service
        const service = await prisma.service.create({
            data: {
                name: `Premium ${cat.name} Combo`,
                description: `Freshly prepared ${cat.name} delivered to your doorstep. Choose your daily special!`,
                price: 199,
                duration: "45 mins",
                category: cat.name,
                subcategories: [subName],
                shopId: shop.id,
                isActive: true,
                dailyMenu: {
                    mon: "Rajma Chawal + Salad + Pickle",
                    tue: "Paneer Butter Masala + 3 Butter Rotis",
                    wed: "Aloo Gobhi + Dal Tadka + Rice",
                    thu: "Kadai Paneer + Lacha Paratha",
                    fri: "Chole Bhature Special",
                    sat: "Veg Biryani + Raita",
                    sun: "Special Thali (Chef Choice)"
                },
                image: "/uploads/shared/services/thali_special.png"
            }
        });

        console.log(`🍱 Created Service: ${service.name} with 7-day Daily Menu.`);
    }

    console.log("\n✨ Setup Complete! The user can now manage these Cloud Kitchen shops.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
