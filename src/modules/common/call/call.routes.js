const express = require('express');
const router = express.Router();
const callController = require('./call.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

// All call routes require authentication
router.use(authMiddleware);

router.post('/initiate', callController.initiate.bind(callController));
router.patch('/:id/status', callController.updateStatus.bind(callController));
router.post('/:id/unlock', callController.unlock.bind(callController));
router.get('/:id', callController.detail.bind(callController));

module.exports = router;
