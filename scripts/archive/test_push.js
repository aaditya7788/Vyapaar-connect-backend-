const { initializeFirebase } = require('./src/utils/firebase');
const admin = initializeFirebase();

/**
 * TEST PUSH NOTIFICATION SCRIPT
 * 
 * Usage:
 * 1. Get your device's Expo Push Token from the mobile app logs 
 *    (Look for: "✅ Push token registered with backend: ExponPushToken[...]")
 * 2. Paste the token below.
 * 3. Run: node test_push.js
 */

const TARGET_TOKEN = 'PASTE_YOUR_EXPO_PUSH_TOKEN_HERE'; 

const testPush = async () => {
    if (!admin) {
        console.error('❌ Firebase not initialized. Check your backend/.env values.');
        return;
    }

    if (TARGET_TOKEN === 'PASTE_YOUR_EXPO_PUSH_TOKEN_HERE') {
        console.error('❌ You must provide a real push token in the TARGET_TOKEN variable.');
        return;
    }

    // This matches the payload the app expects in src/utils/notificationNavigation.js
    const message = {
        token: TARGET_TOKEN,
        notification: {
            title: '🔥 Test Notification',
            body: 'Hello! This is a test from your backend.',
        },
        data: {
            type: 'CHAT_UI',
            bookingId: 'test-booking-id',
            roomId: 'test-room-id',
            profileKey: 'CHAT_MESSAGE', // Triggers the sound/vibration logic
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'chat-messages',
                sound: 'default'
            }
        }
    };

    try {
        console.log('📤 Sending test push to:', TARGET_TOKEN);
        const response = await admin.messaging().send(message);
        console.log('✅ Successfully sent message:', response);
    } catch (error) {
        console.error('❌ Error sending message:', error);
    }
};

testPush();
