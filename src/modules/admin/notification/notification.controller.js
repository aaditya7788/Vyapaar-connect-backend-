const { sendPushToUser, normalizeUrl } = require('../../common/booking/booking.notification');
const { dispatchFcmCampaign } = require('../../common/notification/fcm.service');

/**
 * @desc Dispatch arbitrary push notification campaign
 * @route POST /api/admin/notifications/dispatch
 */
exports.dispatchNotification = async (req, res) => {
    try {
        const { userId, title, body, imageUrl, sponsoredImageUrl, externalLink, data, targetType } = req.body;

        if (!title || !body) {
            return res.status(400).json({ status: 'fail', message: 'Title and body are required' });
        }

        const payloadData = {
            ...(data || {}),
            title,
            body,
            imageUrl: normalizeUrl(imageUrl),
            sponsoredImageUrl: normalizeUrl(sponsoredImageUrl),
            url: externalLink
        };

        console.log(`📣 [AdminNotif] Dispatching Campaign:`);
        console.log(`   Title: ${title}`);
        console.log(`   Body: ${body}`);
        console.log(`   Payload:`, JSON.stringify(payloadData, null, 2));

        let result;
        if (targetType === 'USER' || (!targetType && userId)) {
            if (!userId) {
                return res.status(400).json({ status: 'fail', message: 'userId is required for single user target' });
            }
            console.log(`📡 [AdminNotif] Sending Direct Campaign via Native FCM to user ${userId}...`);
            
            // 1. Fetch native tokens for this specific user
            const tokensFound = await require('../../../db').pushToken.findMany({
                where: { userId },
                select: { token: true }
            });
            const registrationTokens = tokensFound.map(t => t.token);

            // 2. Dispatch via pure FCM service
            result = await dispatchFcmCampaign(registrationTokens, { title, body }, payloadData);
        } else {
            // Broad categories: PROVIDER, CUSTOMER, ALL
            console.log(`📡 [AdminNotif] Broadcasting Campaign via Native FCM to: ${targetType || 'ALL'}...`);
            
            // 1. Fetch matching tokens for native FCM only
            const targetRole = (targetType || 'ALL').toUpperCase();
            const tokenWhere = targetRole === 'ALL' ? {} : { user: { roles: { has: targetRole.toLowerCase() } } };
            
            const tokensFound = await require('../../../db').pushToken.findMany({
                where: tokenWhere,
                select: { token: true }
            });
            
            const registrationTokens = tokensFound.map(t => t.token);

            // 2. Dispatch via pure FCM service
            result = await dispatchFcmCampaign(registrationTokens, { title, body }, payloadData);
        }

        res.status(200).json({
            status: 'success',
            message: 'Notification campaign dispatched',
            details: result
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
