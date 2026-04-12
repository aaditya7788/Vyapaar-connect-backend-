const express = require('express');
const router = express.Router();
const serviceController = require('./service.controller');

/**
 * List services for a specific shop
 */
router.get('/shop/:shopId', serviceController.getShopServices);

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
