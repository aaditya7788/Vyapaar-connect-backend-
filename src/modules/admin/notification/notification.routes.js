const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

// Apply admin guard to all notification routes
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route   POST /api/admin/notifications/dispatch
 * @desc    Launch a push notification campaign
 * @access  Admin Only
 */
router.post('/dispatch', notificationController.dispatchNotification);

module.exports = router;
