const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');
const { upload } = require('../../../middleware/upload.js');

/**
 * @route   GET /api/user/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authMiddleware, userController.getProfile);

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile data (name, email)
 * @access  Private
 */
router.put('/profile', authMiddleware, userController.updateProfile);

/**
 * @route   POST /api/user/avatar
 * @desc    Upload profile avatar image
 * @access  Private
 */
router.post('/avatar', 
  authMiddleware, 
  (req, res, next) => { req.uploadFolder = 'uploads/customer/avatars'; next(); },
  upload.single('avatar'), 
  userController.updateAvatar
);

/**
 * @route   POST /api/user/push-token
 * @desc    Submit device push notification token
 * @access  Private
 */
router.post('/push-token', authMiddleware, userController.registerPushToken);

/**
 * @route   GET /api/user/notifications
 * @desc    Get user notification history
 * @access  Private
 */
router.get('/notifications', authMiddleware, userController.getNotifications);

/**
 * @route   PUT /api/user/notifications/read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/notifications/read', authMiddleware, userController.markNotificationsRead);

/**
 * @route   DELETE /api/user/notifications/:id
 * @desc    Delete a specific notification
 * @access  Private
 */
router.delete('/notifications/:id', authMiddleware, userController.deleteNotification);

module.exports = router;
