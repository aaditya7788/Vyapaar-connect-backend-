const express = require('express');
const router = express.Router();
const serviceController = require('./service.controller');
const { authMiddleware, optionalAuthMiddleware } = require('../../../middleware/auth.middleware');

/**
 * List services for a specific shop
 */
router.get('/shop/:shopId', optionalAuthMiddleware, serviceController.getShopServices);

/**
 * Check multiple services' availability status
 */
router.post('/availability', serviceController.checkAvailability);

/**
 * Create a new service
 */
router.post('/', serviceController.createService);

/**
 * Update a service
 */
router.put('/:id', serviceController.updateService);

/**
 * Update service status (active/inactive)
 */
router.patch('/:id/status', serviceController.toggleStatus);

/**
 * Delete a service
 */
router.delete('/:id', serviceController.deleteService);

module.exports = router;
