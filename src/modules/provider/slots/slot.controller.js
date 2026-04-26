const slotService = require('./slot.service');
const response = require('../../../utils/response');

/**
 * GET /api/provider/slots/available?shopId=...&date=YYYY-MM-DD
 * Public - Get available slots for a shop on a specific date.
 */
const getAvailableSlots = async (req, res) => {
    try {
        const { shopId, date } = req.query;
        if (!shopId || !date) {
            return response.error(res, 'shopId and date are required', 'VALIDATION_ERROR', 400);
        }

        // Basic date format validation
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return response.error(res, 'date must be in YYYY-MM-DD format', 'VALIDATION_ERROR', 400);
        }

        const slots = await slotService.getAvailableSlots(shopId, date);
        return response.success(res, 'Slots fetched successfully', slots);
    } catch (error) {
        console.error('[SLOTS] getAvailableSlots error:', error);
        return response.error(res, 'Failed to fetch slots');
    }
};

/**
 * GET /api/provider/slots/config/:shopId
 * Protected (Provider) - Get full schedule configuration for their shop.
 */
const getShopConfig = async (req, res) => {
    try {
        const { shopId } = req.params;
        const configs = await slotService.getShopConfig(shopId);
        return response.success(res, 'Slot config fetched', configs);
    } catch (error) {
        console.error('[SLOTS] getShopConfig error:', error);
        return response.error(res, 'Failed to fetch slot config');
    }
};

/**
 * POST /api/provider/slots/config
 * Protected (Provider) - Create or update a slot config entry.
 * Body: { shopId, id?, dayOfWeek, startTime, endTime, slotDuration, maxBookings, isBreak, label }
 */
const upsertConfig = async (req, res) => {
    try {
        const { shopId, dayOfWeek, startTime, endTime, configs } = req.body;

        // Support both single and bulk upsert
        if (configs && Array.isArray(configs)) {
            if (!shopId) return response.error(res, 'shopId is required for bulk update', 'VALIDATION_ERROR', 400);
            const data = await slotService.bulkUpsertConfigs(shopId, configs);
            return response.success(res, 'Bulk slot config saved', data, 201);
        }

        if (!shopId || dayOfWeek === undefined || !startTime || !endTime) {
            return response.error(res, 'shopId, dayOfWeek, startTime, endTime are required', 'VALIDATION_ERROR', 400);
        }

        const config = await slotService.upsertConfig(shopId, req.body);
        return response.success(res, 'Slot config saved', config, 201);
    } catch (error) {
        console.error('[SLOTS] upsertConfig error:', error);
        return response.error(res, 'Failed to save slot config');
    }
};

/**
 * DELETE /api/provider/slots/config/:id
 * Protected (Provider) - Delete a slot config entry.
 * Query: ?shopId=... (to verify ownership)
 */
const deleteConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { shopId } = req.query;

        if (!shopId) {
            return response.error(res, 'shopId query param is required', 'VALIDATION_ERROR', 400);
        }

        await slotService.deleteConfig(id, shopId);
        return response.success(res, 'Slot config deleted');
    } catch (error) {
        console.error('[SLOTS] deleteConfig error:', error);
        return response.error(res, error.message || 'Failed to delete slot config');
    }
};

module.exports = { getAvailableSlots, getShopConfig, upsertConfig, deleteConfig };
