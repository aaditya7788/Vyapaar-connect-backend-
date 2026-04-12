const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Starting Deep Discovery Seeding...");

  // 1. Get a Provider Profile to link shops to
  const providerProfile = await prisma.providerProfile.findFirst();
  if (!providerProfile) {
    console.error("❌ No ProviderProfile found. Please log in as a provider at least once first.");
    process.exit(1);
  }

  // 2. Fetch communities for mapping
  const runwal = await prisma.community.findUnique({ where: { slug: 'runwal' } });
  const godrej = await prisma.community.findUnique({ where: { slug: 'godrej' } });
  const lodha = await prisma.community.findUnique({ where: { slug: 'lodha' } });
  const outside = await prisma.community.findUnique({ where: { slug: 'outside' } });

  const shopsData = [
    {
      name: "VoltFlow Electricals",
      category: "Home Maintenance",
      subcategories: ["AC Repair", "Home Wiring"],
      address: "Bldg 12, Garden Grove, Runwal City",
      businessSummary: "Specialized in energy-efficient home wiring and smart lighting solutions since 2018.",
      status: "VERIFIED",
      communityId: runwal?.id,
      profileImage: "/uploads/shared/services/electrician.png",
      backgroundImages: ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200&auto=format&fit=crop"],
      experience: "6 Yrs",
      services: [
        { name: "Split AC Servicing", price: 599, duration: "1.5 hrs", description: "Deep chemical cleaning and filter wash.", category: "Home Maintenance", subcategories: ["AC Repair"] },
        { name: "Switchboard Replacement", price: 249, duration: "30 mins", description: "Modular switch installation.", category: "Home Maintenance", subcategories: ["Home Wiring"] }
      ]
    },
    {
      name: "Velvet Overload Cakes",
      category: "Cakes & Bakery",
      subcategories: ["Cake Shops", "Pastries"],
      address: "Shop 7, Main Square, Lodha Palava",
      businessSummary: "Handcrafted dessert boutique specializing in custom wedding and birthday cakes.",
      status: "VERIFIED",
      communityId: lodha?.id,
      profileImage: "/uploads/shared/services/bakery.png",
      backgroundImages: ["https://images.unsplash.com/photo-1550617931-e17a7b70dce2?q=80&w=1200&auto=format&fit=crop"],
      experience: "5 Yrs",
      services: [
        { name: "Classic Chocolate Ganache (1kg)", price: 850, duration: "2 hrs", description: "Rich dark chocolate with velvet finish.", category: "Cakes & Bakery", subcategories: ["Cake Shops"] },
        { name: "Mixed Fruit Pastry Tray", price: 450, duration: "1 hr", description: "Box of 6 assortment of seasonal fruit pastries.", category: "Cakes & Bakery", subcategories: ["Pastries"] }
      ]
    },
    {
      name: "GlowUp Home Salon",
      category: "Beauty & Spa",
      subcategories: ["Salon at Home", "Makeup Artist"],
      address: "Bldg A3, Hillside, Godrej",
      businessSummary: "Premium salon services at your doorstep. Skilled artists for bridal and party makeups.",
      status: "VERIFIED",
      communityId: godrej?.id,
      profileImage: "/uploads/shared/services/salon.png",
      backgroundImages: ["https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop"],
      experience: "8 Yrs",
      services: [
        { name: "Hydra-Facial Grooming", price: 1299, duration: "1.5 hrs", description: "Deep hydration treatment with premium products.", category: "Beauty & Spa", subcategories: ["Salon at Home"] },
        { name: "Party Makeup (Standard)", price: 1999, duration: "2 hrs", description: "Elegant look for evening events including hairstyling.", category: "Beauty & Spa", subcategories: ["Makeup Artist"] }
      ]
    },
    {
      name: "The Spice Route",
      category: "Dining & Restaurants",
      subcategories: ["Restaurants", "Fast Food"],
      address: "Main gate, Dombivli East",
      businessSummary: "Authentic multi-cuisine restaurant serving traditional Indian and Chinese delicacies.",
      status: "VERIFIED",
      communityId: outside?.id,
      profileImage: "/uploads/shared/services/restaurant.png",
      backgroundImages: ["https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop"],
      experience: "15 Yrs",
      services: [
        { name: "Family Meal Box (Veg)", price: 749, duration: "45 mins", description: "Includes 2 Sabzi, Dal, Jeera Rice, 6 Rotis and Gulab Jamun.", category: "Dining & Restaurants", subcategories: ["Restaurants"] },
        { name: "Schezwan Noodles (Double)", price: 220, duration: "20 mins", description: "Extra spicy tossed noodles with fresh veggies.", category: "Dining & Restaurants", subcategories: ["Fast Food"] }
      ]
    },
    {
      name: "Grandma's Kitchen",
      category: "Homemade Food",
      subcategories: ["Home Food", "Tiffin Services"],
      address: "Bldg 45, Garden Grove, Runwal City",
      businessSummary: "Pure, preservative-free home-cooked meals. Just like grandma used to make.",
      status: "VERIFIED",
      communityId: runwal?.id,
      profileImage: "/uploads/shared/services/chef.png",
      backgroundImages: ["https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=1200&auto=format&fit=crop"],
      experience: "25 Yrs",
      services: [
        { name: "Monthly Tiffin (Lunch/Dinner)", price: 3500, duration: "30 days", description: "Balanced diet including Roti, Sabzi, Dal, and Rice.", category: "Homemade Food", subcategories: ["Tiffin Services"] },
        { name: "Alu Paratha Plate (2pcs)", price: 120, duration: "30 mins", description: "Spicy stuffed parathas with fresh curd and pickle.", category: "Homemade Food", subcategories: ["Home Food"] }
      ]
    },
    {
      name: "PureFlow Plumbers",
      category: "Home Maintenance",
      subcategories: ["Water Leakage", "Clog Clearing"],
      address: "Shop 4, Market Square, Runwal MyCity",
      businessSummary: "Quickest leak detection and fixing specialists in the area. 24/7 emergency support.",
      status: "VERIFIED",
      communityId: runwal?.id,
      profileImage: "/uploads/shared/services/plumber.png",
      backgroundImages: ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1200&auto=format&fit=crop"],
      experience: "4 Yrs",
      services: [
        { name: "Tap Leakage Fix", price: 149, duration: "20 mins", description: "All internal washers included.", category: "Home Maintenance", subcategories: ["Water Leakage"] },
        { name: "Bathroom Clog Clearing", price: 799, duration: "1 hr", description: "Advanced mechanical snake cleaning.", category: "Home Maintenance", subcategories: ["Clog Clearing"] }
      ]
    },
    {
      name: "Urban Fresh Grocers",
      category: "Daily Essentials",
      subcategories: ["Grocery", "Fruits & Vegetables"],
      address: "Block C, Lodha",
      businessSummary: "Widest range of organic pulses, farm-fresh vegetables and gourmet snacks.",
      status: "VERIFIED",
      communityId: lodha?.id,
      profileImage: "/uploads/shared/services/grocery.png",
      backgroundImages: ["https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop"],
      experience: "10 Yrs",
      services: [
        { name: "Seasonal Veggie Basket (5kg)", price: 549, duration: "1 hr", description: "Assortment of fresh organic vegetables including potatoes and onions.", category: "Daily Essentials", subcategories: ["Fruits & Vegetables"] },
        { name: "Organic Pulse Combo (3-Pack)", price: 420, duration: "1 hr", description: "1kg Tur Dal, 1kg Chana, 1kg Moong.", category: "Daily Essentials", subcategories: ["Grocery"] }
      ]
    },
    {
      name: "Gadget Repair Lab",
      category: "Gadgets & IT",
      subcategories: ["Mobile Repair", "Computer Repair"],
      address: "Tower 5, Outside Society",
      businessSummary: "Component-level repairs for iPhones, MacBooks and Gaming PCs. Quick turnaround.",
      status: "VERIFIED",
      communityId: outside?.id,
      profileImage: "/uploads/shared/services/it.png",
      backgroundImages: ["https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=1200&auto=format&fit=crop"],
      experience: "9 Yrs",
      services: [
        { name: "iPhone Screen Replacement", price: 3999, duration: "1 hr", description: "High-quality OLED replacement with warranty.", category: "Gadgets & IT", subcategories: ["Mobile Repair"] },
        { name: "Deep PC Cleaning (Desktop)", price: 800, duration: "2 hrs", description: "Removal of dust, thermal paste re-application and cable management.", category: "Gadgets & IT", subcategories: ["Computer Repair"] }
      ]
    },
    {
      name: "WoodCraft Studios",
      category: "Home Maintenance",
      subcategories: ["Furniture Repair", "Lock Installation"],
      address: "Sector 3, Dombivli East",
      businessSummary: "Expert furniture assembly and heritage wood restoration works.",
      status: "VERIFIED",
      profileImage: "/uploads/shared/services/carpenter.png",
      backgroundImages: ["https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=1200&auto=format&fit=crop"],
      experience: "12 Yrs",
      services: [
        { name: "Door Lock Installation", price: 349, duration: "45 mins", description: "Digital and manual locks.", category: "Home Maintenance", subcategories: ["Lock Installation"] },
        { name: "Furniture Assembly", price: 499, duration: "2 hrs", description: "IKEA/Global brand assembly specialists.", category: "Home Maintenance", subcategories: ["Furniture Repair"] }
      ]
    }
  ];

  for (const sData of shopsData) {
    const { services, ...shopInfo } = sData;
    
    console.log(`🏠 Creating Shop: ${shopInfo.name}...`);
    const shop = await prisma.shop.create({
      data: {
        ...shopInfo,
        providerProfileId: providerProfile.id,
        services: {
          create: services
        }
      }
    });
    console.log(`✅ Success: ${shop.name} created!`);
  }

  console.log("🏁 Deep Discovery Seeding Complete!");
  process.exit(0);
}

seed();
