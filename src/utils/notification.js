const { dispatchFcmCampaign } = require('../modules/common/notification/fcm.service');
const prisma = require('../db');

/**
 * Send a push notification to a specific user by their ID
 * @param {string} userId - The target user ID
 * @param {object} payload - { title, body, data }
 */
const sendNotificationToUser = async (userId, { title, body, data = {} }) => {
    try {
        if (!userId) return { success: false, error: 'No user ID provided' };

        // 1. Fetch all native FCM tokens for this user
        const tokens = await prisma.pushToken.findMany({
            where: { 
                userId,
                token: { not: { startsWith: 'ExponentPushToken' } } // Only target native FCM tokens
            },
            select: { token: true }
        });

        if (tokens.length === 0) {
            console.log(`[Notification] No FCM tokens found for user ${userId}. Skipping push.`);
            return { success: false, error: 'No tokens found' };
        }

        const registrationTokens = tokens.map(t => t.token);

        // 2. Dispatch via FCM Service
        return await dispatchFcmCampaign(registrationTokens, { title, body }, data);
    } catch (error) {
        console.error(`[Notification Error] Failed to send to user ${userId}:`, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendNotificationToUser
};
