const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

// Apply admin guard
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route   GET /api/admin/users/search
 * @desc    Search for users to target with notifications
 * @access  Admin Only
 */
router.get('/search', userController.searchUsers);

module.exports = router;
