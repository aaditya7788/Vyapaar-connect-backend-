const { sendPushToUser, sendPushToCategory } = require('../../common/booking/booking.notification');

/**
 * @desc Dispatch arbitrary push notification campaign
 * @route POST /api/admin/notifications/dispatch
 */
exports.dispatchNotification = async (req, res) => {
    try {
        const { userId, title, body, imageUrl, externalLink, data, targetType } = req.body;

        if (!title || !body) {
            return res.status(400).json({ status: 'fail', message: 'Title and body are required' });
        }

        const payloadData = { 
            ...(data || {}), 
            imageUrl, 
            url: externalLink 
        };

        let result;
        if (targetType === 'USER' || (!targetType && userId)) {
            if (!userId) {
                return res.status(400).json({ status: 'fail', message: 'userId is required for single user target' });
            }
            result = await sendPushToUser(userId, { title, body }, payloadData);
        } else {
            // Broad categories: PROVIDER, CUSTOMER, ALL
            result = await sendPushToCategory(targetType || 'ALL', { title, body }, payloadData);
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
