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
router.get('/list', userController.listUsers);
router.get('/:id', userController.getUserDetails);
router.get('/:id/bookings', userController.getUserBookings);
router.get('/:id/transactions', userController.getUserTransactions);
router.get('/:id/activity', userController.getUserActivity);
router.patch('/:id/status', userController.updateUserStatus);

module.exports = router;
