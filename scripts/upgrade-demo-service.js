const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Upgrading Demo Service to Rich Menu format...");

    const service = await prisma.service.findFirst({
        where: { name: "Premium Homemade Food Combo" }
    });

    if (!service) {
        console.error("❌ Demo service not found! Run the setup-cloud-kitchen.js script first.");
        return;
    }

    const richMenu = {
        weeklyPrice: 999,
        mon: [
            { id: "m1", name: "Executive Veg Thali", price: 150, image: "/uploads/shared/services/thali_special.png" },
            { id: "m2", name: "Dal Khichdi Tadka", price: 120, image: "/uploads/shared/services/dal_khichdi.png" }
        ],
        tue: [
            { id: "t1", name: "Paneer Butter Masala Combo", price: 180, image: "/uploads/shared/services/paneer_combo.png" },
            { id: "t2", name: "Veg Pulao + Raita", price: 130, image: "/uploads/shared/services/pulao.png" }
        ],
        wed: [
            { id: "w1", name: "North Indian Thali", price: 160, image: "/uploads/shared/services/north_thali.png" },
            { id: "w2", name: "Chole Bhature (2 pcs)", price: 110, image: "/uploads/shared/services/chole_bhature.png" }
        ],
        thu: [
            { id: "th1", name: "Aloo Paratha Combo (2 pcs)", price: 100, image: "/uploads/shared/services/paratha.png" },
            { id: "th2", name: "Mix Veg + 3 Rotis", price: 140, image: "/uploads/shared/services/mix_veg.png" }
        ],
        fri: [
            { id: "f1", name: "Special Maharashtrian Thali", price: 170, image: "/uploads/shared/services/maha_thali.png" },
            { id: "f2", name: "Pav Bhaji Special", price: 120, image: "/uploads/shared/services/pav_bhaji.png" }
        ],
        sat: [
            { id: "s1", name: "Veg Dum Biryani", price: 190, image: "/uploads/shared/services/biryani.png" },
            { id: "s2", name: "Paneer Tikka (6 pcs)", price: 150, image: "/uploads/shared/services/paneer_tikka.png" }
        ],
        sun: [
            { id: "su1", name: "Sunday Feast Thali", price: 220, image: "/uploads/shared/services/feast_thali.png" },
            { id: "su2", name: "Gulab Jamun (2 pcs)", price: 50, image: "/uploads/shared/services/gulab_jamun.png" }
        ]
    };

    await prisma.service.update({
        where: { id: service.id },
        data: {
            dailyMenu: richMenu
        }
    });

    console.log(`✅ Service "${service.name}" upgraded successfully!`);
    console.log("🍱 Now check your Home Screen or Service Details to see the rich menu in action.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
