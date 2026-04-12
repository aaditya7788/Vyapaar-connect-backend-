const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slugify = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
const getIconPath = (name) => `uploads/shared/services/${slugify(name)}.png`;

const categoriesData = [
  {
    name: 'Home Maintenance',
    subcategories: ['Electrician', 'Plumbing', 'AC Repair', 'Cleaning', 'Painting', 'Civil Work', 'Borewell', 'House Keeping']
  },
  {
    name: 'Food Services',
    subcategories: ['Restaurants', 'Home Food', 'Caterers']
  },
  {
    name: 'Cakes & Bakery',
    subcategories: ['Cake Shops', 'Bakery']
  },
  {
    name: 'Health',
    subcategories: ['Doctors', 'Pharmacy', 'Massage']
  },
  {
    name: 'Beauty & Salon',
    subcategories: ['Salon at Home', 'Makeup Artist']
  },
  {
    name: 'Daily Essentials',
    subcategories: ['Grocery', 'Milk Delivery', 'Fruits & Vegetables', 'Florists', 'Stationery']
  },
  {
    name: 'Bills & Recharge',
    subcategories: ['Mobile Recharge', 'Utility Bill Payments']
  },
  {
    name: 'Education',
    subcategories: ['Tutors', 'Coaching Classes', 'Online Classes']
  },
  {
    name: 'Business Services',
    subcategories: ['Consultants', 'B2B Services', 'Bulk SMS', 'Digital Marketing', 'Accounting']
  },
  {
    name: 'Events & Entertainment',
    subcategories: ['Marriage Halls', 'Party Plots', 'Event Organizer', 'Decorators', 'DJs & Sound']
  },
  {
    name: 'Automobile',
    subcategories: ['Car Repair', 'Bike Repair', 'Car Wash', 'Accessories', 'Towing']
  },
  {
    name: 'Family & Personal Care',
    subcategories: ['Baby Sitters', 'Baby Care', 'Pet Supplies', 'Elder Care']
  },
  {
    name: 'Construction & Real Estate',
    subcategories: ['Builders', 'Property Dealers', 'Interior Designers']
  },
  {
    name: 'IT & Tech Services',
    subcategories: ['Computer Repair', 'Mobile Repair', 'Software Services']
  },
  {
    name: 'Other Services',
    subcategories: ['Custom Services']
  }
];

async function main() {
    console.log('--- START SEEDING ---');
    
    // Clear existing
    console.log('Clearing old categories and subcategories...');
    await prisma.subcategory.deleteMany({});
    await prisma.category.deleteMany({});

    for (const cat of categoriesData) {
        console.log(`Seeding category: ${cat.name}`);
        const category = await prisma.category.create({
            data: {
                name: cat.name,
                icon: getIconPath(cat.name)
            }
        });

        for (const sub of cat.subcategories) {
            await prisma.subcategory.create({
                data: {
                    name: sub,
                    icon: getIconPath(sub),
                    categoryId: category.id
                }
            });
        }
    }

    console.log('--- SEEDING COMPLETED ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
