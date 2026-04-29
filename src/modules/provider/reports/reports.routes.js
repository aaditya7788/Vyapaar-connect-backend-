const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

/**
 * Provider Reports Routes
 */

// Download Activity Report (Authenticated)
router.get('/download', authMiddleware, reportsController.downloadReport);

module.exports = router;
