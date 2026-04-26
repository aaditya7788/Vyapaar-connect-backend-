const prisma = require('../../../db');

/**
 * Get public app configurations
 */
exports.getPublicSettings = async (req, res) => {
    try {
        const settings = await prisma.globalSettings.findMany({
            where: {
                key: {
                    in: ['BOOKING_EXPIRE_TIME', 'BOOKING_ALERT_DURATION', 'BOOKING_ALERT_REPEAT', 'early_call_charge_coin', 'ACCEPT_TIMEOUT_MIN']
                }
            }
        });
        
        // Convert array to key-value object for easier frontend use
        const config = {};
        settings.forEach(s => config[s.key] = s.value);
        
        res.status(200).json({ status: 'success', data: config });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
