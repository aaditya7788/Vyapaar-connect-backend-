const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = "aadityasahani78@gmail.com";
    console.log(`🔍 Cleaning up and seeding fresh daily menus for: ${email}...`);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { providerProfile: true }
    });

    if (!user || !user.providerProfile) {
        console.error("❌ User or Provider Profile not found!");
        return;
    }

    const profileId = user.providerProfile.id;

    // 1. Cleanup: Deactivate existing "Homemade Food" services for this provider
    const oldShops = await prisma.shop.findMany({
        where: { category: "Homemade Food", providerProfileId: profileId }
    });

    const oldShopIds = oldShops.map(s => s.id);
    if (oldShopIds.length > 0) {
        const deactivatedCount = await prisma.service.updateMany({
            where: { shopId: { in: oldShopIds } },
            data: { isActive: false }
        });
        console.log(`🔕 Deactivated ${deactivatedCount.count} old services.`);
    }

    // 2. Create the "Grandma's Cloud Kitchen" Shop
    const shop = await prisma.shop.create({
        data: {
            name: "Grandma's Cloud Kitchen",
            address: "Building 4, Runwal Gardens, Dombivli East",
            area: "Runwal Gardens",
            providerProfileId: profileId,
            status: "APPROVED",
            category: "Homemade Food",
            subcategories: ["Cloud Kitchen", "Pure Veg"],
            businessSummary: "Authentic homemade meals prepared with love and fresh ingredients. Each day features a unique traditional specialty.",
            workingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            workingHoursStart: "11:00 AM",
            workingHoursEnd: "09:00 PM",
            communityType: "runwal",
            latitude: 19.1678,
            longitude: 73.1092,
            profileImage: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=800",
            backgroundImages: ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200"],
            averageRating: 4.9,
            reviewCount: 42
        }
    });

    console.log(`🏪 Created Shop: ${shop.name}`);

    // 3. Define Daily Specialties
    const specialties = [
        {
            name: "Mutter Paneer Special Thali",
            description: "Creamy Mutter Paneer served with 3 soft Phulkas, Jeera Rice, Dal Tadka, and fresh Salad.",
            price: 180,
            days: ["mon", "tue"],
            image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?q=80&w=800",
            inclusions: [
                { name: "Extra Paneer", price: 40 },
                { name: "Sweet Lassi", price: 30 }
            ]
        },
        {
            name: "Homestyle Butter Chicken Meal",
            description: "Tender chicken cooked in a rich tomato gravy. Includes 2 Butter Naans, Pulao, and Raita.",
            price: 240,
            days: ["wed", "thu", "fri"],
            image: "https://images.unsplash.com/photo-1603894584202-933259bb499b?q=80&w=800",
            inclusions: [
                { name: "Extra Gravy", price: 20 },
                { name: "Roasted Papad", price: 10 }
            ]
        },
        {
            name: "South Indian Masala Dosa Feast",
            description: "Crispy Golden Dosa with spiced potato filling. Served with authentic Sambhar and Coconut Chutney.",
            price: 150,
            days: ["sat", "sun"],
            image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?q=80&w=800",
            inclusions: [
                { name: "Extra Cheese", price: 25 },
                { name: "Filter Coffee", price: 20 }
            ]
        },
        {
            name: "Evergreen Mix Veg Combo",
            description: "Daily seasonal vegetables sautéed with mild spices. Served with 2 Rotis and Plain Rice.",
            price: 140,
            days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800",
            inclusions: []
        }
    ];

    for (const spec of specialties) {
        // Create dailyMenu object: { [day]: [true] } for available days
        const dailyMenu = {};
        spec.days.forEach(day => {
            dailyMenu[day] = [true]; // Using array to satisfy existing frontend check
        });

        const service = await prisma.service.create({
            data: {
                name: spec.name,
                description: spec.description,
                price: spec.price,
                duration: "30-45 mins",
                category: "Homemade Food",
                subcategories: ["Cloud Kitchen"],
                shopId: shop.id,
                isActive: true,
                dailyMenu: dailyMenu,
                image: spec.image,
                minQuantity: 1,
                maxQuantity: 10,
                stock: 20,
                configurableInclusions: {
                    create: spec.inclusions
                }
            }
        });
        console.log(`🍱 Created Service: ${service.name} (Available: ${spec.days.join(", ")})`);
    }

    console.log("\n✨ Seeding Complete!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
