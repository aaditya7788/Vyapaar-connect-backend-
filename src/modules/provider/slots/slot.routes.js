const express = require('express');
const router = express.Router();
const slotController = require('./slot.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

/**
 * PUBLIC — Get available slots for a shop on a date
 * GET /api/provider/slots/available?shopId=&date=YYYY-MM-DD
 */
router.get('/available', slotController.getAvailableSlots);

/**
 * PROVIDER PROTECTED — Get full schedule config
 * GET /api/provider/slots/config/:shopId
 */
router.get('/config/:shopId', authMiddleware, slotController.getShopConfig);

/**
 * PROVIDER PROTECTED — Create / update a slot config entry
 * POST /api/provider/slots/config
 */
router.post('/config', authMiddleware, slotController.upsertConfig);

/**
 * PROVIDER PROTECTED — Delete a slot config entry
 * DELETE /api/provider/slots/config/:id?shopId=
 */
router.delete('/config/:id', authMiddleware, slotController.deleteConfig);

module.exports = router;
