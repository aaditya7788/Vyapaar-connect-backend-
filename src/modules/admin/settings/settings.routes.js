const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route   GET /api/admin/settings
 * @desc    Get all global settings
 */
router.get('/', settingsController.getSettings);

/**
 * @route   PATCH /api/admin/settings/:key
 * @desc    Update a specific setting
 */
router.patch('/:key', settingsController.updateSetting);

module.exports = router;
