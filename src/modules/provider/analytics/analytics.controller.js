const analyticsService = require('./analytics.service');

const getAnalytics = async (req, res) => {
    try {
        const { id } = req.params;
        const stats = await analyticsService.getShopAnalytics(id);
        res.status(200).json({ status: 'success', data: stats });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const trackView = async (req, res) => {
    try {
        const { id } = req.params;
        await analyticsService.incrementShopView(id);
        res.status(200).json({ status: 'success', message: 'View tracked' });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

const getServiceAnalytics = async (req, res) => {
    try {
        const { id } = req.params;
        const { period } = req.query;
        const stats = await analyticsService.getServiceAnalytics(id, period);
        res.status(200).json({ status: 'success', data: stats });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
};

module.exports = {
    getAnalytics,
    trackView,
    getServiceAnalytics
};
