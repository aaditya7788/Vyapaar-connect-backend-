const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

// All routes are protected by admin middleware
router.use(authMiddleware, adminMiddleware);

router.get('/stats', dashboardController.getStats);
router.get('/trends', dashboardController.getTrends);
router.get('/categories', dashboardController.getCategoryStats);
router.get('/activity', dashboardController.getActivity);

module.exports = router;
