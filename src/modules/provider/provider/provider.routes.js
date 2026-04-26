const express = require('express');
const router = express.Router();
const providerController = require('./provider.controller');
const { authMiddleware, optionalAuthMiddleware } = require('../../../middleware/auth.middleware');

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
router.post('/shops', authMiddleware, providerController.addShop);

/**
 * @route   PATCH /api/provider/shops/:id/status
 */
router.patch('/shops/:id/status', authMiddleware, providerController.updateShopStatus);

/**
 * @route   PUT /api/provider/shops/:id
 */
router.put('/shops/:id', authMiddleware, providerController.updateShop);

/**
 * @route   GET /api/provider/shops
 */
router.get('/shops', authMiddleware, providerController.listShops);

/**
 * @route   DELETE /api/provider/shops/:id
 */
router.delete('/shops/:id', authMiddleware, providerController.deleteShop);

/**
 * @route   GET /api/provider/shops/:id
 */
router.get('/shops/:id', optionalAuthMiddleware, providerController.getShopById);

/**
 * @route   GET /api/provider/dashboard/:id
 */
router.get('/dashboard/:id', authMiddleware, providerController.getDashboard);

/**
 * Gallery Management — Granular Updates
 */
router.post('/shops/:id/gallery', authMiddleware, providerController.addGalleryImage);
router.delete('/shops/:id/gallery', authMiddleware, providerController.removeGalleryImage);

module.exports = router;
