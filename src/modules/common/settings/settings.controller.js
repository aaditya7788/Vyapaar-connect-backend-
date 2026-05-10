const prisma = require('../../../db');

const PUBLIC_SETTING_KEYS = [
    'early_call_charge_coin', 
    'ACCEPT_TIMEOUT_MIN', 
    'TRUST_ALERT_THRESHOLD', 
    'SAFETY_RISK_THRESHOLD', 
    'REMARK_THRESHOLD_AT_RISK', 
    'REMARK_THRESHOLD_POOR',
    'SUPPORT_EMAIL',
    'TERMS_AND_CONDITIONS',
    'PRIVACY_POLICY',
    'MAINTENANCE_MODE',
    'STRICT_KM_FILTER',
    'RADIUS_FILTER_KM',
    'ACTIVE_TIMEOUT_HOURS',
    'CANCEL_WINDOW_HOURS',
    'MAX_SESSIONS',
    'BOOKING_RETRY_LIMIT',
    'BOOKING_BUFFER_MIN',
    'REMARK_VISIBLE_THRESHOLD',
    'REMARK_DISTANCE_PENALTY',
    'REMARK_PENALTY_FACTOR',
    'REMARK_FALSE_REPORT_PENALTY',
    'REMARK_WEIGHT_RUDE',
    'REMARK_WEIGHT_DELAYED',
    'REMARK_WEIGHT_UNPROFESSIONAL',
    'REMARK_WEIGHT_FRAUD',
    'REMARK_WEIGHT_SAFETY',
    'REMARK_CATEGORIES_JSON'
];

/**
 * Get public app configurations
 */
exports.getPublicSettings = async (req, res) => {
    try {
        const settings = await prisma.globalSettings.findMany({
            where: {
                key: {
                    in: PUBLIC_SETTING_KEYS
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

/**
 * Update app settings (Admin Only)
 */
exports.updateSettings = async (req, res) => {
    try {
        const { settings } = req.body; // Expecting { KEY: VALUE }

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ status: 'error', message: 'Invalid settings object' });
        }

        const updates = Object.entries(settings).map(([key, value]) => {
            return prisma.globalSettings.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            });
        });

        await Promise.all(updates);

        res.status(200).json({ status: 'success', message: 'Settings updated successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
