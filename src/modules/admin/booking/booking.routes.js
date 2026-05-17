const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

// Apply admin guard
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @route   GET /api/admin/bookings/list
 * @desc    Get all platform bookings with filters
 * @access  Admin Only
 */
router.get('/list', bookingController.listBookings);

module.exports = router;
