const express = require('express');
const router = express.Router();
const auth2faController = require('./auth2fa.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

/**
 * Middleware to allow setup/enable if email is provided (Forced Setup flow)
 * or if the user is already authenticated (Settings page flow).
 */
const optionalAuthForSetup = (req, res, next) => {
    const hasEmail = req.query.email || req.body.email;
    if (hasEmail) {
        return next();
    }
    return authMiddleware(req, res, next);
};

// Public route for MFA verification during login
router.post('/verify', auth2faController.verify2FA);

// Routes that support both Forced Setup (via email) and Manual Setup (via auth)
router.get('/setup', optionalAuthForSetup, auth2faController.setup2FA);
router.post('/enable', optionalAuthForSetup, auth2faController.enable2FA);

// Disable always requires full authentication
router.post('/disable', authMiddleware, auth2faController.disable2FA);

module.exports = router;
