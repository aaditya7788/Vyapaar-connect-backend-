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
                        // Include system notification block ONLY if not data-only
                        ...(!data.isDataOnly && {
                            notification: {
                                title,
                                body,
                                image: bannerUrl
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
                            }
                        }),
                        // Data payload is ALWAYS sent
                        data: {
                            ...data,
                            title: title || '',
                            body: body || '',
                            imageUrl: bannerUrl || data.imageUrl || '',
                            sponsoredImageUrl: sponsoredUrl || data.sponsoredImageUrl || '',
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
                        ...(!data.isDataOnly && {
                            notification: {
                                title,
                                body,
                                image: bannerUrl
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
                            }
                        }),
                        data: {
                            ...data,
                            title: title || '',
                            body: body || '',
                            image: bannerUrl || data.imageUrl || '',
                            channelId: 'booking-alerts',
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
 * Send a push notification to a specific user and optionally save to history
 */
const sendPushToUser = async (userId, { title, body }, data = {}, channelId = 'booking-alerts') => {
    try {
        let notificationId = null;

        // 1. Save to Notification History in DB (Unless explicitly skipped)
        if (!data.skipHistory) {
            const dbNotification = await prisma.notification.create({
                data: {
                    userId,
                    title,
                    body,
                    type: data.type || 'GENERAL',
                    data: { ...data, targetContext: data.targetContext || 'customer' }
                }
            });
            notificationId = dbNotification.id;
        }

        // 2. Fetch all active push tokens for this user
        const tokens = await prisma.pushToken.findMany({
            where: { userId },
            select: { token: true, platform: true, sessionId: true }
        });

        // 3. Deduplicate tokens (ensure unique strings)
        const uniqueTokens = [...new Set(tokens.map(t => t.token))];

        if (uniqueTokens.length === 0) {
            console.log(`[Push] No push tokens found for user ${userId}.`);
            return { successCount: 0, failureCount: 0 };
        }

        // Tag the push payload with the targetContext and ID
        const result = await _dispatchToServices(uniqueTokens, { title, body }, {
            ...data,
            notificationId: notificationId || data.notificationId,
            targetContext: data.targetContext || 'customer'
        }, channelId);

        console.log(`[Push] Successfully sent to ${result.successCount}/${uniqueTokens.length} unique devices for user ${userId}`);
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
 
/**
 * Centralized Notification Content Map
 * Perspectives: CUSTOMER and PROVIDER
 */
const BOOKING_NOTIFICATION_MAP = {
    CONFIRMED: {
        customer: {
            title: 'Accepted! ✅',
            body: (data) => `Great news! ${data.providerName} is confirmed for ${data.serviceName} at ${data.time}.`
        },
        provider: {
            title: 'Success 🎉',
            body: (data) => `Job confirmed with ${data.customerName}. Don't forget to arrive on time!`
        }
    },
    ARRIVED: {
        customer: {
            title: 'Arrived! 📍',
            body: (data) => `${data.providerName} is at your doorstep for ${data.serviceName}. Please greet them!`
        },
        provider: {
            title: 'Check-in 📍',
            body: (data) => `Location logged. Ask ${data.customerName} for the service start OTP.`
        }
    },
    IN_PROGRESS: {
        customer: {
            title: 'Started 🚀',
            body: (data) => `Your ${data.serviceName} is now in progress. Sit back and relax!`
        },
        provider: {
            title: 'In Progress 🛠️',
            body: (data) => `Good luck with ${data.customerName}'s job! Remember to maintain quality.`
        }
    },
    COMPLETED: {
        customer: {
            title: 'Done! ✨',
            body: (data) => `Service complete! Hope you enjoyed your ${data.serviceName}. Please rate ${data.providerName}!`
        },
        provider: {
            title: 'Great Job! 💰',
            body: (data) => `You've completed the service for ${data.customerName}. Payment will be processed.`
        }
    },
    CANCELLED: {
        customer: {
            title: 'Cancelled ❌',
            body: (data) => `Your booking for ${data.serviceName} has been cancelled.`
        },
        provider: {
            title: 'Cancelled ❌',
            body: (data) => `The request from ${data.customerName} for ${data.serviceName} was withdrawn.`
        }
    },
    DECLINED: {
        customer: {
            title: 'Declined 🚫',
            body: (data) => `Sorry, the professional couldn't take your request for ${data.serviceName} right now. ${data.reason ? `Reason: ${data.reason}` : ''}`
        },
        provider: {
            title: 'Declined 🚫',
            body: (data) => `You've declined the request from ${data.customerName} for ${data.serviceName}.`
        }
    },
    EXPIRED: {
        customer: {
            title: 'Expired ⏳',
            body: (data) => `We couldn't find a provider for your ${data.serviceName} in time. Would you like to try again?`
        },
        provider: {
            title: 'Expired ⏳',
            body: (data) => `The booking request from ${data.customerName} for ${data.serviceName} has expired.`
        }
    }
};

module.exports = {
    BOOKING_NOTIFICATION_MAP,
    sendPushToUser,
    sendPushToCategory,
    sendChatPush: async (userId, senderName, content, data) => {
        return await sendPushToUser(userId, {
            title: `💬 ${senderName}`,
            body: content.length > 100 ? content.substring(0, 100) + '...' : content
        }, { ...data, profileKey: 'CHAT_MESSAGE', type: 'CHAT_UI', categoryId: 'chat_messages', skipHistory: true }, 'chat-messages');
    },
    sendCallPush: async (userId, senderName, data) => {
        return await sendPushToUser(userId, {
            title: `📞 Incoming Call`,
            body: `${senderName} is calling...`
        }, { ...data, profileKey: 'INC_CALL', type: 'CALL_UI', skipHistory: true });
    },
    normalizeUrl: _normalizeUrl
};
