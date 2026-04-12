const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

router.post('/send-phone-otp', authController.sendPhoneOtp);
router.post('/verify-phone-otp', authController.verifyPhoneOtp);

/**
 * All routes below this require authentication
 * Requires Access Token from verify-phone-otp
 */
router.post('/complete-profile', authMiddleware, authController.completeProfile);
router.post('/send-email-otp', authMiddleware, authController.sendEmailOtp);
router.post('/verify-email-otp', authMiddleware, authController.verifyEmailOtp);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);

module.exports = router;
