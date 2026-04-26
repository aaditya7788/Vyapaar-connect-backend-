const { getShopAnalytics } = require('../src/modules/provider/analytics/analytics.service');
const prisma = require('../src/db');

async function testAnalytics() {
    const shopId = 'c18a392f-0aa2-48b5-ba4f-d68103afef1c';
    
    try {
        console.log('Fetching analytics for shop:', shopId);
        const stats = await getShopAnalytics(shopId);
        console.log('Analytics Result:', JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error fetching analytics:', error);
    }
}

testAnalytics().finally(() => prisma.$disconnect());
