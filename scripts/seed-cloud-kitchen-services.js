const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCloudKitchenServices() {
    const shopId = '8cbd2209-8f57-482a-86cf-72a4bac7c14d'; // Homemade Food Delights
    const category = 'Homemade Food';
    const subcategories = ['Cloud Kitchen'];

    const items = [
        {
            name: 'Monday Special Veg Thali',
            price: 150,
            duration: '30 mins',
            image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
            days: ['mon']
        },
        {
            name: 'Paneer Tikka Meal',
            price: 180,
            duration: '40 mins',
            image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=80',
            days: ['mon', 'tue']
        },
        {
            name: 'Hyderabadi Chicken Biryani',
            price: 250,
            duration: '45 mins',
            image: 'https://images.unsplash.com/photo-1563379091339-03b21bc4a4f8?auto=format&fit=crop&w=800&q=80',
            days: ['wed', 'sun']
        },
        {
            name: 'Dal Khichdi Tadka',
            price: 120,
            duration: '25 mins',
            image: 'https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80',
            days: ['tue', 'thu']
        },
        {
            name: 'Puran Poli Special Thali',
            price: 190,
            duration: '50 mins',
            image: 'https://images.unsplash.com/photo-1601050690597-df056fb4679a?auto=format&fit=crop&w=800&q=80',
            days: ['fri', 'sat']
        },
        {
            name: 'Special Pav Bhaji',
            price: 140,
            duration: '20 mins',
            image: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=800&q=80',
            days: ['sat', 'sun']
        },
        {
            name: 'Homestyle Chicken Curry',
            price: 210,
            duration: '40 mins',
            image: 'https://images.unsplash.com/photo-1603894584134-f17478a1e50f?auto=format&fit=crop&w=800&q=80',
            days: ['wed', 'fri', 'sun']
        }
    ];

    console.log('🚀 Seeding separate services for Cloud Kitchen...');

    for (const item of items) {
        await prisma.service.create({
            data: {
                name: item.name,
                price: item.price,
                duration: item.duration,
                image: item.image,
                category: category,
                subcategories: subcategories,
                shopId: shopId,
                dailyMenu: item.days, // Store availability days here
                isActive: true
            }
        });
        console.log(`✅ Created: ${item.name} (Available: ${item.days.join(', ')})`);
    }

    console.log('✨ Seeding complete!');
}

seedCloudKitchenServices()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
