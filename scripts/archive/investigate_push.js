const { Expo } = require('expo-server-sdk');
const { PrismaClient } = require('@prisma/client');

const expo = new Expo();
const prisma = new PrismaClient();

const investigate = async () => {
    console.log('🔍 Investigating Push Delivery...');
    const tokens = await prisma.pushToken.findMany({ select: { token: true } });
    const expoTokens = tokens.map(t => t.token).filter(t => t.startsWith('ExponentPushToken'));

    if (expoTokens.length === 0) return console.log('No Expo tokens found.');

    const messages = expoTokens.map(token => ({
        to: token,
        title: 'Investigation',
        body: 'Checking delivery path...',
    }));

    const tickets = await expo.sendPushNotificationsAsync(messages);
    console.log('🎟️ Ticket generated. Waiting 5 seconds for receipt...');
    
    // Wait for Expo to process the delivery to Google
    await new Promise(r => setTimeout(r, 5000));

    const receiptIds = tickets.map(t => t.id).filter(id => id);
    const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

    for (const chunk of receiptChunks) {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        for (let receiptId in receipts) {
            let { status, message, details } = receipts[receiptId];
            if (status === 'error') {
                console.error(`❌ DELIVERY ERROR: ${message}`);
                console.error(`🛠️ TECHNICAL DETAILS: ${JSON.stringify(details)}`);
                
                if (message.includes('MismatchedSenderId') || message.includes('Missing credentials')) {
                    console.log('\n💡 SOLUTION: You MUST upload your Firebase Service Account JSON to Expo!');
                    console.log('Run: eas push:config:upload --platform android');
                }
            } else {
                console.log('✅ Expo delivered it to Google successfully.');
            }
        }
    }
};

investigate();
