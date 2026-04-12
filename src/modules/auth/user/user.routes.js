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
  (req, res, next) => { req.uploadFolder = 'uploads/avatars'; next(); },
  upload.single('avatar'), 
  userController.updateAvatar
);

/**
 * @route   POST /api/user/push-token
 * @desc    Submit device push notification token
 * @access  Private
 */
router.post('/push-token', authMiddleware, userController.registerPushToken);

module.exports = router;
