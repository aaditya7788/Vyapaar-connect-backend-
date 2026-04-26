const { getMessaging } = require('../../../utils/firebase');
const prisma = require('../../../db');
const { Expo } = require('expo-server-sdk');
const env = require('../../../config/env');

// Initialize Expo SDK
const expo = new Expo();

/**
 * Helper to ensure URLs are absolute for push notification clients (FCM/Expo)
 */
const _normalizeUrl = (url) => {
    if (!url) return null;

    // Smart Redirect for legacy absolute URLs pointing to old server's uploads
    if (url.startsWith('http')) {
        if (url.includes('/uploads/') && !url.includes(env.AWS?.S3_BASE_URL)) {
            const parts = url.split('/uploads/');
            const s3Base = env.AWS?.S3_BASE_URL;
            if (s3Base) {
                return `${s3Base.replace(/\/$/, '')}/uploads/${parts[1]}`;
            }
        }
        return url;
    }

    // Use S3_BASE_URL for managed uploads (relative paths)
    if (url.startsWith('/uploads') || url.startsWith('uploads')) {
        const s3Base = env.AWS?.S3_BASE_URL;
        if (s3Base) {
            return `${s3Base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        }
    }

    // Fallback to environment-defined BASE_URL for other assets
    const baseUrl = env.BASE_URL;
    return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
};

/**
 * Helper to dispatch notifications to multiple services (Firebase and Expo)
 */
const _dispatchToServices = async (registrationTokens, { title, body }, data = {}, channelId = 'booking-alerts') => {
    const bannerUrl = _normalizeUrl(data.imageUrl);
    const sponsoredUrl = _normalizeUrl(data.sponsoredImageUrl);
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
                            image: bannerUrl // Standard FCM image field
                        },
                        android: {
                            notification: {
                                channelId: channelId,
                                priority: 'max',
                                sound: 'default',
                                defaultSound: true,
                                notificationPriority: 'priority_max',
                                imageUrl: bannerUrl
                            }
                        },
                        apns: {
                            payload: {
                                aps: {
                                    'mutable-content': 1 // Required for iOS rich media notifications
                                }
                            }
                        },
                        data: {
                            ...data,
                            imageUrl: bannerUrl || data.imageUrl,
                            sponsoredImageUrl: sponsoredUrl || data.sponsoredImageUrl,
                            channelId: channelId,
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
                data: {
                    ...data,
                    image: bannerUrl || data.imageUrl,
                    imageUrl: bannerUrl || data.imageUrl,
                    sponsoredImageUrl: sponsoredUrl || data.sponsoredImageUrl,
                },
                channelId: channelId,
                categoryId: data.categoryId || undefined,
                priority: 'high',
            }));

            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                for (let ticket of ticketChunk) {
                    if (ticket.status === 'ok') {
                        successCount++;
                    } else {
                        console.error('[Push] Expo Ticket Error:', ticket.message);
                        failureCount++;
                    }
                }
            }
        } catch (error) {
            console.error('[Push] Expo Dispatch Error:', error.message);
            failureCount += expoTokens.length;
        }
    }

    return { successCount, failureCount };
};

/**
 * NEW: Mission Control - Direct Firebase Dispatch for Campaigns
 * Filters out Expo tokens and uses raw Multicast for reliability.
 */
const _dispatchToFirebaseOnly = async (registrationTokens, { title, body }, data = {}) => {
    const bannerUrl = _normalizeUrl(data.imageUrl);
    let successCount = 0;
    let failureCount = 0;

    // Filter to ENSURE only Native FCM tokens are used
    const fcmTokens = (registrationTokens || []).filter(t => !t.startsWith('ExponentPushToken'));

    if (fcmTokens.length > 0) {
        try {
            const messaging = getMessaging();
            if (messaging) {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < fcmTokens.length; i += CHUNK_SIZE) {
                    const chunk = fcmTokens.slice(i, i + CHUNK_SIZE);
                    
                    // Match the EXACT payload from Mission Control Script
                    const message = {
                        notification: { 
                            title, 
                            body, 
                            image: bannerUrl 
                        },
                        data: {
                            ...data,
                            title,
                            body,
                            image: bannerUrl || data.imageUrl,
                            channelId: 'booking-alerts',
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                channelId: 'booking-alerts',
                                priority: 'max',
                                icon: 'notifications_icon',
                                color: '#4F8F6A',
                                sound: 'default'
                            }
                        },
                        tokens: chunk,
                    };

                    const response = await messaging.sendEachForMulticast(message);
                    successCount += response.successCount;
                    failureCount += response.failureCount;

                    // Cleanup invalid tokens found in mission control
                    if (response.failureCount > 0) {
                        const invalidTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                const errorCode = resp.error?.code;
                                if (errorCode === 'messaging/registration-token-not-registered' || 
                                    errorCode === 'messaging/invalid-registration-token') {
                                    invalidTokens.push(chunk[idx]);
                                }
                            }
                        });
                        if (invalidTokens.length > 0) {
                            await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Push-MissionControl] Firebase Dispatch Failed:', error.message);
        }
    }
    return { successCount, failureCount };
};

/**
 * Send a push notification to a specific user and save to history
 */
const sendPushToUser = async (userId, { title, body }, data = {}, channelId = 'booking-alerts') => {
    try {
        // 1. Save to Notification History in DB
        const dbNotification = await prisma.notification.create({
            data: {
                userId,
                title,
                body,
                type: data.type || 'GENERAL',
                data: { ...data, targetContext: data.targetContext || 'customer' }
            }
        });

        // 2. Fetch all active push tokens for this user
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
        // Tag the push payload with the targetContext and ID
        const result = await _dispatchToServices(registrationTokens, { title, body }, {
            ...data,
            notificationId: dbNotification.id,
            targetContext: data.targetContext || 'customer'
        }, channelId);

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
        // 1. Fetch matching users to save history for each
        const targetRole = category?.toUpperCase(); // 'CUSTOMER', 'PROVIDER', or 'ALL'
        const whereClause = targetRole === 'ALL' ? {} : { roles: { has: targetRole.toLowerCase() } };

        const users = await prisma.user.findMany({
            where: whereClause,
            select: { id: true }
        });

        if (users.length === 0) {
            console.log(`[Push Broadcast] No users found with role: ${targetRole}`);
            return { successCount: 0, failureCount: 0 };
        }

        // 2. Save to Notification History for ALL matching users in bulk
        await prisma.notification.createMany({
            data: users.map(user => ({
                userId: user.id,
                title,
                body,
                type: data.type || 'CAMPAIGN',
                data: data
            }))
        });

        // 3. Fetch all device tokens for these users
        const tokens = await prisma.pushToken.findMany({
            where: targetRole === 'ALL' ? {} : { user: { roles: { has: targetRole.toLowerCase() } } },
            select: { token: true }
        });

        if (tokens.length === 0) {
            console.log(`[Push Broadcast] No device tokens found for category ${category}`);
            return { successCount: 1, failureCount: 0, note: 'Saved to history, but no active devices' };
        }

        const registrationTokens = tokens.map(t => t.token);
        // 🔥 Use dedicated Firebase-only path for Campaigns
        const result = await _dispatchToFirebaseOnly(registrationTokens, { title, body }, data);

        console.log(`[Push Broadcast] Sent to ${result.successCount} devices in category ${category}`);
        return result;
    } catch (error) {
        console.error('[Push Broadcast] Error:', error.message);
    }
};

module.exports = {
    sendPushToUser,
    sendPushToCategory,
    sendChatPush: async (userId, senderName, content, data) => {
        return await sendPushToUser(userId, {
            title: `💬 ${senderName}`,
            body: content.length > 100 ? content.substring(0, 100) + '...' : content
        }, { ...data, profileKey: 'CHAT_MESSAGE', type: 'CHAT_UI', categoryId: 'chat_messages' }, 'chat-messages');
    },
    sendCallPush: async (userId, senderName, data) => {
        return await sendPushToUser(userId, {
            title: `📞 Incoming Call`,
            body: `${senderName} is calling...`
        }, { ...data, profileKey: 'INC_CALL', type: 'CALL_UI' });
    },
    normalizeUrl: _normalizeUrl
};
