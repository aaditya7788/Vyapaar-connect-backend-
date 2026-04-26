const express = require('express');
const { authMiddleware } = require('../../../middleware/auth.middleware');
const recommendController = require('./recommend.controller');

const router = express.Router();

router.post('/:shopId', authMiddleware, recommendController.recommendShop);

module.exports = router;
