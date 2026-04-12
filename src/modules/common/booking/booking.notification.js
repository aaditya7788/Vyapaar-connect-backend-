const { getMessaging } = require('../../../utils/firebase');
const prisma = require('../../../db');
const { Expo } = require('expo-server-sdk');

// Initialize Expo SDK
const expo = new Expo();

/**
 * Helper to dispatch notifications to multiple services (Firebase and Expo)
 */
const _dispatchToServices = async (registrationTokens, { title, body }, data = {}) => {
    let successCount = 0;
    let failureCount = 0;

    const fcmTokens = [];
    const expoTokens = [];

    // 1. Sort tokens by service
    registrationTokens.forEach(token => {
        if (Expo.isExpoPushToken(token)) {
            expoTokens.push(token);
        } else {
            // Assume rest are FCM tokens
            fcmTokens.push(token);
        }
    });

    // 2. Dispatch to Firebase (FCM)
    if (fcmTokens.length > 0) {
        try {
            const messaging = getMessaging();
            if (messaging) {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < fcmTokens.length; i += CHUNK_SIZE) {
                    const chunk = fcmTokens.slice(i, i + CHUNK_SIZE);
                    const message = {
                        notification: { 
                            title, 
                            body,
                            ...(data.imageUrl ? { image: data.imageUrl } : {})
                        },
                        data: {
                            ...data,
                            click_action: 'FLUTTER_NOTIFICATION_CLICK',
                        },
                        tokens: chunk,
                    };
                    const response = await messaging.sendEachForMulticast(message);
                    successCount += response.successCount;
                    failureCount += response.failureCount;

                    // Cleanup invalid FCM tokens
                    if (response.failureCount > 0) {
                        const invalidTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                const errorCode = resp.error?.code;
                                if (
                                    errorCode === 'messaging/registration-token-not-registered' ||
                                    errorCode === 'messaging/invalid-registration-token'
                                ) {
                                    invalidTokens.push(chunk[idx]);
                                }
                            }
                        });
                        if (invalidTokens.length > 0) {
                            await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
                        }
                    }
                }
            } else {
                console.warn('[Push] Skipping FCM: Firebase messaging not initialized.');
                failureCount += fcmTokens.length;
            }
        } catch (error) {
            console.error('[Push] FCM Dispatch Error:', error.message);
            failureCount += fcmTokens.length;
        }
    }

    // 3. Dispatch to Expo
    if (expoTokens.length > 0) {
        try {
            const messages = expoTokens.map(token => ({
                to: token,
                sound: 'default',
                title,
                body,
                data,
            }));

            // Expo recommends batching 100 at a time
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                // Note: Tickets only confirm receipt by Expo, not delivery.
                // We increment successCount for now.
                successCount += ticketChunk.length;
                
                // Real delivery status requires checking receipts later, 
                // but for campaigns, we keep it simple.
            }
        } catch (error) {
            console.error('[Push] Expo Dispatch Error:', error.message);
            failureCount += expoTokens.length;
        }
    }

    return { successCount, failureCount };
};

/**
 * Send a push notification to a specific user
 */
const sendPushToUser = async (userId, { title, body }, data = {}) => {
    try {
        // 1. Fetch all active push tokens for this user
        const tokens = await prisma.pushToken.findMany({
            where: { userId },
            select: { token: true }
        });

        console.log(`[Push] User ${userId} has ${tokens.length} active device tokens`);

        if (tokens.length === 0) {
            console.log(`[Push] No push tokens found for user ${userId}.`);
            return { successCount: 0, failureCount: 0 };
        }

        const registrationTokens = tokens.map(t => t.token);
        const result = await _dispatchToServices(registrationTokens, { title, body }, data);
        
        console.log(`[Push] Successfully sent to ${result.successCount} devices for user ${userId}`);
        return result;
    } catch (error) {
        console.error('[Push] Fatal error sending notification:', error.message);
    }
};

/**
 * Send a notification to a specific category of users
 */
const sendPushToCategory = async (category, { title, body }, data = {}) => {
    try {
        // 1. Build role filter (Handle lowercase mismatch from DB)
        let where = {};
        if (category === 'CUSTOMER') where = { user: { roles: { has: 'customer' } } };
        else if (category === 'PROVIDER') where = { user: { roles: { has: 'provider' } } };

        // 2. Fetch all tokens for this category
        const tokens = await prisma.pushToken.findMany({
            where,
            select: { token: true }
        });

        if (tokens.length === 0) {
            console.log(`[Push Broadcast] No tokens found for category ${category}`);
            return { successCount: 0, failureCount: 0 };
        }

        const registrationTokens = tokens.map(t => t.token);
        const result = await _dispatchToServices(registrationTokens, { title, body }, data);

        console.log(`[Push Broadcast] Sent to ${result.successCount} devices in category ${category}`);
        return result;
    } catch (error) {
        console.error('[Push Broadcast] Error:', error.message);
    }
};

module.exports = {
    sendPushToUser,
    sendPushToCategory
};
