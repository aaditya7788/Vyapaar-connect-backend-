const express = require('express');
const router = express.Router();
const walletController = require('./wallet.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

// Root path: /api/provider/wallet

/**
 * @route   GET /api/provider/wallet/overview
 * @desc    Fetch balance and transaction history
 */
router.get('/overview', authMiddleware, walletController.getOverview);

/**
 * @route   POST /api/provider/wallet/create-order
 * @desc    Initialize a Razorpay credit purchase order
 */
router.post('/create-order', authMiddleware, walletController.createOrder);

/**
 * @route   POST /api/provider/wallet/apply-coupon
 * @desc    Apply a discount or redeem a coin coupon
 */
router.post('/apply-coupon', authMiddleware, walletController.applyCoupon);

/**
 * @route   POST /api/provider/wallet/verify-payment
 * @desc    Verify signature and fulfill credit addition
 */
router.post('/verify-payment', authMiddleware, walletController.verifyPayment);

/**
 * @route   POST /api/provider/wallet/webhook
 * @desc    Asynchronous fulfillment backup from Razorpay
 */
router.post('/webhook', walletController.handleWebhook);

module.exports = router;
