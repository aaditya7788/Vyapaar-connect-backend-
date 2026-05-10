const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Upgrading Homemade Food Shop Services...");

    // 1. Enable supportsQuantity for Homemade Food
    const foodCategory = await prisma.category.findFirst({
        where: { name: "Homemade Food" }
    });

    if (foodCategory) {
        await prisma.category.update({
            where: { id: foodCategory.id },
            data: { 
                supportsQuantity: true,
                supportsDailyMenu: true
            }
        });
        console.log("✅ Enabled 'supportsQuantity' and 'supportsDailyMenu' for Homemade Food category.");
    }

    // 2. Find all services in Homemade Food
    const services = await prisma.service.findMany({
        where: { category: "Homemade Food" }
    });

    console.log(`Found ${services.length} food services to upgrade.`);

    for (const service of services) {
        console.log(`Updating service: ${service.name}`);

        // Define a rich daily menu if it doesn't have one
        const richMenu = {
            weeklyPrice: service.price * 6, // 6 days price
            mon: [
                { id: `${service.id}-m1`, name: "Executive Veg Thali", price: service.price, image: "/uploads/shared/services/thali_special.png" },
                { id: `${service.id}-m2`, name: "Dal Khichdi Tadka", price: Math.round(service.price * 0.8), image: "/uploads/shared/services/dal_khichdi.png" }
            ],
            tue: [
                { id: `${service.id}-t1`, name: "Paneer Butter Masala Combo", price: Math.round(service.price * 1.2), image: "/uploads/shared/services/paneer_combo.png" },
                { id: `${service.id}-t2`, name: "Veg Pulao + Raita", price: service.price, image: "/uploads/shared/services/pulao.png" }
            ],
            wed: [
                { id: `${service.id}-w1`, name: "North Indian Thali", price: service.price, image: "/uploads/shared/services/north_thali.png" },
                { id: `${service.id}-w2`, name: "Chole Bhature (2 pcs)", price: Math.round(service.price * 0.7), image: "/uploads/shared/services/chole_bhature.png" }
            ],
            thu: [
                { id: `${service.id}-th1`, name: "Aloo Paratha Combo (2 pcs)", price: Math.round(service.price * 0.6), image: "/uploads/shared/services/paratha.png" },
                { id: `${service.id}-th2`, name: "Mix Veg + 3 Rotis", price: Math.round(service.price * 0.9), image: "/uploads/shared/services/mix_veg.png" }
            ],
            fri: [
                { id: `${service.id}-f1`, name: "Special Maharashtrian Thali", price: Math.round(service.price * 1.1), image: "/uploads/shared/services/maha_thali.png" },
                { id: `${service.id}-f2`, name: "Pav Bhaji Special", price: Math.round(service.price * 0.8), image: "/uploads/shared/services/pav_bhaji.png" }
            ],
            sat: [
                { id: `${service.id}-s1`, name: "Veg Dum Biryani", price: Math.round(service.price * 1.3), image: "/uploads/shared/services/biryani.png" },
                { id: `${service.id}-s2`, name: "Paneer Tikka (6 pcs)", price: Math.round(service.price * 1.0), image: "/uploads/shared/services/paneer_tikka.png" }
            ],
            sun: [
                { id: `${service.id}-su1`, name: "Sunday Feast Thali", price: Math.round(service.price * 1.5), image: "/uploads/shared/services/feast_thali.png" },
                { id: `${service.id}-su2`, name: "Gulab Jamun (2 pcs)", price: 50, image: "/uploads/shared/services/gulab_jamun.png" }
            ]
        };

        await prisma.service.update({
            where: { id: service.id },
            data: {
                unit: "plate",
                stock: 50,
                minQuantity: 1,
                maxQuantity: 10,
                dailyMenu: richMenu,
                // Update image to something high quality if it's generic
                image: service.image.includes('default') ? "/uploads/shared/services/thali_special.png" : service.image
            }
        });
    }

    console.log("✅ Upgrade completed for all Homemade Food services.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
