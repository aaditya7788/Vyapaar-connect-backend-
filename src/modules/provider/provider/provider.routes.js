const express = require('express');
const router = express.Router();
const providerController = require('./provider.controller');
const { authMiddleware, optionalAuthMiddleware, providerMiddleware } = require('../../../middleware/auth.middleware');

/**
 * @route   POST /api/provider/onboard
 * @desc    Upgrade existing customer to provider + create first shop
 * @access  Private (Access Token)
 */
router.post('/onboard', authMiddleware, providerController.onboard);

/**
 * @route   POST /api/provider/shops
 * @desc    Add a new shop for existing provider
 * @access  Private (Access Token)
 */
router.post('/shops', providerMiddleware, providerController.addShop);

/**
 * @route   PATCH /api/provider/shops/:id/status
 */
router.patch('/shops/:id/status', providerMiddleware, providerController.updateShopStatus);

/**
 * @route   PUT /api/provider/shops/:id
 */
router.put('/shops/:id', providerMiddleware, providerController.updateShop);

/**
 * @route   GET /api/provider/shops
 */
router.get('/shops', providerMiddleware, providerController.listShops);

/**
 * @route   DELETE /api/provider/shops/:id
 */
router.delete('/shops/:id', providerMiddleware, providerController.deleteShop);

/**
 * @route   GET /api/provider/shops/:id
 */
router.get('/shops/:id', optionalAuthMiddleware, providerController.getShopById);

/**
 * @route   GET /api/provider/dashboard/:id
 */
router.get('/dashboard/:id', providerMiddleware, providerController.getDashboard);

/**
 * Gallery Management — Granular Updates
 */
router.post('/shops/:id/gallery', providerMiddleware, providerController.addGalleryImage);
router.delete('/shops/:id/gallery', providerMiddleware, providerController.removeGalleryImage);

module.exports = router;
