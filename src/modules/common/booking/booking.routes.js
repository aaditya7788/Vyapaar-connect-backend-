const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

/**
 * @route   POST /api/bookings
 * @desc    Create new bookings (bulk from cart)
 * @access  Private
 */
router.post('/', authMiddleware, bookingController.create);

/**
 * @route   GET /api/bookings
 * @desc    Get user's booking history
 * @access  Private
 */
router.get('/', authMiddleware, bookingController.list);

/**
 * @route   GET /api/bookings/provider
 * @desc    Get bookings for a specific shop (Provider console)
 * @access  Private (Provider)
 */
router.get('/provider', authMiddleware, bookingController.listForProvider);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get specific booking detail
 * @access  Private
 */
router.get('/:id', authMiddleware, bookingController.detail);

/**
 * @route   PATCH /api/bookings/:id/status
 * @desc    Update booking status (Cancel, Confirm Start, etc.)
 * @access  Private
 */
router.patch('/:id/status', authMiddleware, bookingController.updateStatus);

/**
 * @route   POST /api/bookings/:id/retry
 * @desc    Retry an expired booking
 * @access  Private
 */
router.post('/:id/retry', authMiddleware, bookingController.retryBooking);

module.exports = router;
