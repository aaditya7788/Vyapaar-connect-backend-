const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

/**
 * @route   GET /api/provider/analytics/:id
 * @desc    Get detailed provider analytics
 * @access  Private
 */
router.get('/:id', authMiddleware, analyticsController.getAnalytics);

/**
 * @route   POST /api/provider/analytics/:id/view
 * @desc    Increment shop view count
 * @access  Public
 */
router.post('/:id/view', analyticsController.trackView);

/**
 * @route   GET /api/provider/analytics/service/:id
 * @desc    Get detailed analytics for a specific service
 * @access  Private
 */
router.get('/service/:id', authMiddleware, analyticsController.getServiceAnalytics);

module.exports = router;
