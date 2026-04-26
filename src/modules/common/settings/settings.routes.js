const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');

router.get('/config', settingsController.getPublicSettings);

module.exports = router;
