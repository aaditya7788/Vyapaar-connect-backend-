const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
    console.log("🌱 Seeding Granular Marketplace Categories & Communities...");

    // 1. Seed Communities
    const communities = [
        {
            slug: 'runwal',
            name: 'Runwal Gardens',
            svgName: 'runwal',
            bgColor: '#F1F8F3',
            textColor: '#1B5E20'
        },
        {
            slug: 'godrej',
            name: 'Godrej Hillside',
            svgName: 'godrej',
            bgColor: '#E3F2FD',
            textColor: '#0D47A1'
        },
        {
            slug: 'lodha',
            name: 'Lodha Palava',
            svgName: 'lodha',
            bgColor: '#FFF3E0',
            textColor: '#E65100'
        },
        {
            slug: 'outside',
            name: 'Outside Community',
            svgName: 'outside',
            bgColor: '#F5F5F5',
            textColor: '#616161'
        }
    ];

    for (const c of communities) {
        console.log(`🏙️ Creating Community: ${c.name}...`);
        await prisma.community.upsert({
            where: { slug: c.slug },
            update: {},
            create: c
        });
    }

    // 2. Granular Categories & Subcategories
    const categoryData = [
        {
            name: "Dining & Restaurants",
            icon: "utensils",
            subcategories: ["Restaurants", "Cafes", "Fine Dining", "Fast Food"]
        },
        {
            name: "Homemade Food",
            icon: "soup",
            subcategories: ["Home Food", "Tiffin Services", "Caterers", "Cloud Kitchen"]
        },
        {
            name: "Cakes & Bakery",
            icon: "cake",
            subcategories: ["Cake Shops", "Pastries", "Breads & Bun"]
        },
        {
            name: "Sweets & Desserts",
            icon: "cookie",
            subcategories: ["Sweets Shop", "Ice Cream Parlor", "Desserts House"]
        },
        {
            name: "Home Maintenance",
            icon: "tool",
            subcategories: ["Electrician", "Plumber", "Carpenter", "Painter", "Pest Control", "Cleaning Services"]
        },
        {
            name: "Home Appliances",
            icon: "monitor",
            subcategories: ["AC Repair", "Fridge Repair", "Washing Machine", "Water Purifier", "Geyser Service", "TV & Electronics"]
        },
        {
            name: "Health & Medical",
            icon: "activity",
            subcategories: ["Doctors", "Pharmacy", "Diagnostic Center", "Physiotherapy"]
        },
        {
            name: "Beauty & Spa",
            icon: "sparkles",
            subcategories: ["Salon at Home", "Makeup Artist", "Beauty Parlor", "Spa", "Hair Stylist"]
        },
        {
            name: "Daily Essentials",
            icon: "shopping-basket",
            subcategories: ["Grocery", "Milk Delivery", "Fruits & Vegetables", "Florists", "Stationery"]
        },
        {
            name: "Automobile Services",
            icon: "settings",
            subcategories: ["Car Repair", "Bike Repair", "Car Wash", "Accessories"]
        },
        {
            name: "Transport & Drivers",
            icon: "car",
            subcategories: ["Driver Services", "Towing", "Packing & Moving"]
        },
        {
            name: "Education & Tutors",
            icon: "graduation-cap",
            subcategories: ["Tutors", "Coaching Classes", "Online Classes", "Music & Dance"]
        },
        {
            name: "Business Services",
            icon: "briefcase",
            subcategories: ["Consultants", "Accounting", "Legal Services", "Digital Marketing"]
        },
        {
            name: "Events & Decor",
            icon: "party-popper",
            subcategories: ["Event Organizer", "Decorators", "DJs & Sound", "Photography"]
        },
        {
            name: "Real Estate",
            icon: "home",
            subcategories: ["Property Dealers", "Builders", "Rent & Lease"]
        },
        {
            name: "Interior & Design",
            icon: "paint-bucket",
            subcategories: ["Interior Designers", "Architects", "Furniture Customization"]
        },
        {
            name: "Gadgets & IT",
            icon: "smartphone",
            subcategories: ["Computer Repair", "Mobile Repair", "CCTV Installation", "Networking"]
        },
        {
            name: "Family & Child Care",
            icon: "heart",
            subcategories: ["Baby Sitters", "Baby Care", "Elder Care"]
        },
        {
            name: "Pet & Laundry",
            icon: "dog",
            subcategories: ["Pet Supplies", "Pet Grooming", "Laundry & Dry Clean"]
        },
        {
            name: "Utilities",
            icon: "credit-card",
            subcategories: ["Mobile Recharge", "Bill Payments", "Insurance"]
        }
    ];

    try {
        console.log("🧹 Reseting categories for clean split...");
        await prisma.subcategory.deleteMany({});
        await prisma.category.deleteMany({});

        for (const cat of categoryData) {
            console.log(`🏠 Creating Category: ${cat.name}...`);
            const category = await prisma.category.create({
                data: {
                    name: cat.name,
                    icon: cat.icon
                }
            });

            for (const sub of cat.subcategories) {
                console.log(`  🔹 Subcategory: ${sub}`);
                await prisma.subcategory.create({
                    data: {
                        name: sub,
                        categoryId: category.id
                    }
                });
            }
        }

        console.log("🏁 Granular Seeding Complete!");
    } catch (error) {
        console.error("❌ Seeding Error:", error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

seed();
