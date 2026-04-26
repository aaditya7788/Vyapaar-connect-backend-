const prisma = require('../../../db');

/**
 * Get all global settings
 */
exports.getSettings = async (req, res) => {
    try {
        const settings = await prisma.globalSettings.findMany({
            orderBy: { key: 'asc' }
        });
        res.status(200).json({ status: 'success', data: settings });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * Update a specific setting
 */
exports.updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({ status: 'fail', message: 'Value is required' });
        }

        const setting = await prisma.globalSettings.upsert({
            where: { key },
            update: { value: String(value) },
            create: { 
                key, 
                value: String(value),
                label: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
            }
        });

        res.status(200).json({ status: 'success', data: setting });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
