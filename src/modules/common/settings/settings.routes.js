const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');

const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

router.get('/config', settingsController.getPublicSettings);
router.post('/config', authMiddleware, adminMiddleware, settingsController.updateSettings);

module.exports = router;
