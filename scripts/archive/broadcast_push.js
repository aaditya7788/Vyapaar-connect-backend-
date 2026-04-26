const { initializeFirebase } = require('./src/utils/firebase');
const { PrismaClient } = require('@prisma/client');

const admin = initializeFirebase();
const prisma = new PrismaClient();

const IMAGE_URL = 'https://picsum.photos/400/300.jpg';

const broadcastPush = async () => {
    try {
        console.log('🔄 Fetching Native FCM tokens...');
        const tokensFound = await prisma.pushToken.findMany({ select: { token: true } });
        const fcmTokens = tokensFound.map(t => t.token).filter(t => t && !t.startsWith('ExponentPushToken'));

        if (fcmTokens.length === 0) {
            console.log('⚠️ No native FCM tokens found.');
            return;
        }

        console.log(`📣 Sending to: ${fcmTokens.join(', ')}`);

        const message = {
            notification: { 
                title: '🔥 Direct FCM Test', 
                body: 'If you see this, priority delivery is working! 🚀',
                image: IMAGE_URL 
            },
            data: {
                title: '🔥 Direct FCM Test',
                body: 'If you see this, priority delivery is working! 🚀',
                type: 'direct_test',
                image: IMAGE_URL
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'booking-alerts', // Match the MAX priority channel in useNotifications.js
                    priority: 'max',
                    icon: 'notifications_icon',
                    color: '#4F8F6A',
                    sound: 'default'
                }
            },
            tokens: fcmTokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`✅ Results: Success ${response.successCount}, Failure ${response.failureCount}`);

        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.error(`❌ ERROR for token [${fcmTokens[idx]}]: ${resp.error.code} - ${resp.error.message}`);
                }
            });
        }

    } catch (error) {
        console.error('❌ Script Crashed:', error);
    } finally {
        await prisma.$disconnect();
    }
};

broadcastPush();
