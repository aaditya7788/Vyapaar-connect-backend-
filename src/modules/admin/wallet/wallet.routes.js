const express = require('express');
const router = express.Router();
const walletController = require('./wallet.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

// Apply admin guard to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route   GET /api/admin/wallet/plans
 * @desc    Get all wallet plans
 */
router.get('/plans', walletController.getAllPlans);

/**
 * @route   POST /api/admin/wallet/plans
 * @desc    Create new plan
 */
router.post('/plans', walletController.createPlan);

/**
 * @route   PATCH /api/admin/wallet/plans/:id
 * @desc    Update plan
 */
router.patch('/plans/:id', walletController.updatePlan);

/**
 * @route   DELETE /api/admin/wallet/plans/:id
 * @desc    Remove plan
 */
router.delete('/plans/:id', walletController.deletePlan);

/**
 * @route   GET /api/admin/wallet/coupons
 * @desc    Get all coupons
 */
router.get('/coupons', walletController.getAllCoupons);

/**
 * @route   POST /api/admin/wallet/coupons
 * @desc    Create new coupon
 */
router.post('/coupons', walletController.createCoupon);

/**
 * @route   PATCH /api/admin/wallet/coupons/:id
 * @desc    Update coupon
 */
router.patch('/coupons/:id', walletController.updateCoupon);

/**
 * @route   DELETE /api/admin/wallet/coupons/:id
 * @desc    Remove coupon
 */
router.delete('/coupons/:id', walletController.deleteCoupon);

/**
 * @route   GET /api/admin/wallet/settings
 * @desc    Get all global settings
 */
router.get('/settings', walletController.getAllSettings);

/**
 * @route   POST /api/admin/wallet/settings
 * @desc    Update or create a setting
 */
router.post('/settings', walletController.updateSetting);


module.exports = router;
