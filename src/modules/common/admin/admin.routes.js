const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

/**
 * @route   GET /api/admin/home/categories
 * @desc    Get all categories with visibility and order for admin management
 */
router.get('/home/categories', authMiddleware, adminMiddleware, adminController.getHomeCategories);

/**
 * @route   PATCH /api/admin/home/categories/order
 * @desc    Update the display order of multiple categories
 */
router.patch('/home/categories/order', authMiddleware, adminMiddleware, adminController.updateCategoriesOrder);

/**
 * @route   PATCH /api/admin/home/categories/:id/visibility
 * @desc    Toggle category visibility on home page
 */
router.patch('/home/categories/:id/visibility', authMiddleware, adminMiddleware, adminController.toggleCategoryVisibility);

/**
 * @route   GET /api/admin/shops
 * @desc    Get all shops for linking
 */
router.get('/shops', authMiddleware, adminMiddleware, adminController.getShopsForAdmin);

/**
 * @route   GET /api/admin/services
 * @desc    Get all services for linking
 */
router.get('/services', authMiddleware, adminMiddleware, adminController.getServicesForAdmin);

/**
 * @route   GET /api/admin/ads
 * @desc    Get all advertisements
 */
router.get('/ads', authMiddleware, adminMiddleware, adminController.listAds);

/**
 * @route   POST /api/admin/ads
 * @desc    Create a new advertisement
 */
router.post('/ads', authMiddleware, adminMiddleware, adminController.createAd);

/**
 * @route   PATCH /api/admin/ads/:id
 * @desc    Update an advertisement
 */
router.patch('/ads/:id', authMiddleware, adminMiddleware, adminController.updateAd);

/**
 * @route   DELETE /api/admin/ads/:id
 * @desc    Delete an advertisement
 */
router.delete('/ads/:id', authMiddleware, adminMiddleware, adminController.deleteAd);

module.exports = router;
