const { sendPushToCategory, sendPushToUser } = require('../src/modules/common/booking/booking.notification');
const { initializeFirebase } = require('../src/utils/firebase');

async function testFix() {
    try {
        console.log('--- Testing Notification Fix ---');
        initializeFirebase();
        
        console.log('1. Testing category ALL...');
        const resAll = await sendPushToCategory('ALL', { title: 'Test All', body: 'This is a test for all' });
        console.log('Result ALL:', resAll);

        console.log('\n2. Testing category PROVIDER...');
        const resProv = await sendPushToCategory('PROVIDER', { title: 'Test Provider', body: 'This is a test for providers' });
        console.log('Result PROVIDER:', resProv);

        console.log('\n3. Testing category CUSTOMER...');
        const resCust = await sendPushToCategory('CUSTOMER', { title: 'Test Customer', body: 'This is a test for customers' });
        console.log('Result CUSTOMER:', resCust);

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

testFix();
