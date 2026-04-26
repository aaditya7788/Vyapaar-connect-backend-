const { getMessaging } = require('../../../utils/firebase');
const prisma = require('../../../db');

const env = require('../../../config/env');

/**
 * Helper to ensure URLs are absolute for push notification clients (FCM)
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
 * Clean FCM-Only Mission Control
 * ZERO Expo dependencies here.
 */
const dispatchFcmCampaign = async (registrationTokens, { title, body }, data = {}) => {
    const bannerUrl = _normalizeUrl(data.imageUrl);
    let successCount = 0;
    let failureCount = 0;

    // HARD FILTER: Only allow Native Tokens
    const totalCount = (registrationTokens || []).length;
    const fcmTokens = (registrationTokens || []).filter(t => t && !t.startsWith('ExponentPushToken'));

    console.log(`📊 [FCM-Service] Token Audit: Found ${totalCount} total in DB ➡ Filtered to ${fcmTokens.length} Native FCM targets.`);

    if (fcmTokens.length === 0) {
        console.log('⚠️ [FCM-Service] No native FCM tokens found in chunk.');
        return { successCount: 0, failureCount: 0 };
    }

    try {
        const messaging = getMessaging();
        if (!messaging) {
            console.error('❌ [FCM-Service] Firebase Messaging not initialized');
            return { successCount: 0, failureCount: fcmTokens.length };
        }

        const CHUNK_SIZE = 500;
        for (let i = 0; i < fcmTokens.length; i += CHUNK_SIZE) {
            const chunk = fcmTokens.slice(i, i + CHUNK_SIZE);

            const message = {
                notification: {
                    title,
                    body,
                    image: bannerUrl
                },
                data: {
                    ...Object.entries(data).reduce((acc, [key, val]) => {
                        if (val !== null && val !== undefined && val !== '') acc[key] = String(val);
                        return acc;
                    }, {}),
                    title: String(title || ''),
                    body: String(body || ''),
                    ...(bannerUrl && { image: String(bannerUrl) }),
                    channelId: 'booking-alerts',
                    priority: 'high'
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

            console.log(`🚀 [FCM-Service] Multicast Result: Success ${response.successCount}, Failure ${response.failureCount}`);

            // Cleanup invalid tokens from DB
            if (response.failureCount > 0) {
                const invalidTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errorCode = resp.error?.code;
                        const errorMessage = resp.error?.message;
                        
                        console.error(`❌ [FCM-Service] Delivery Failed for Token [${chunk[idx].substring(0, 10)}...]: ${errorCode} - ${errorMessage}`);

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
        return { successCount, failureCount };
    } catch (error) {
        console.error('❌ [FCM-Service] Fatal Dispatch Error:', error.message);
        return { successCount: 0, failureCount: fcmTokens.length };
    }
};

module.exports = {
    dispatchFcmCampaign,
    normalizeUrl: _normalizeUrl
};
