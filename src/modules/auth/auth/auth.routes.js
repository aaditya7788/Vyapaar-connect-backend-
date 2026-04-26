const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authMiddleware, optionalAuthMiddleware } = require('../../../middleware/auth.middleware');

router.post('/send-phone-otp', optionalAuthMiddleware, authController.sendPhoneOtp);
router.post('/verify-phone-otp', optionalAuthMiddleware, authController.verifyPhoneOtp);
router.post('/send-email-otp', optionalAuthMiddleware, authController.sendEmailOtp);
router.post('/verify-email-otp', optionalAuthMiddleware, authController.verifyEmailOtp);
router.post('/google-signin', authController.googleSignin);
router.get('/check-availability', authController.checkAvailability);

/**
 * All routes below this require authentication
 */
router.post('/complete-profile', authMiddleware, authController.completeProfile);
router.get('/sessions', authMiddleware, authController.listSessions);
router.post('/logout-others', authMiddleware, authController.logoutOtherDevices);
router.delete('/sessions/:sessionId', authMiddleware, authController.logoutSpecificDevice);

router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);

module.exports = router;
