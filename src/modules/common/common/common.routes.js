const express = require('express');
const path = require('path');
const router = express.Router();
const commonController = require('./common.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');
const { upload } = require('../../../middleware/upload');

/**
 * @route   POST /api/common/upload
 * @desc    Standard file upload to uploads/common
 * @access  Private (Private for better control but can be public if needed)
 */

router.post('/upload', 
  authMiddleware, 
  (req, res, next) => {
    const { domain = 'shared', type = 'others' } = req.query;
    // Construct systematic path
    req.uploadFolder = `uploads/${domain}/${type}`;
    next();
  },
  upload.single('file'), 
  commonController.uploadSingle
);

/**
 * @route   POST /api/common/upload/category
 * @desc    Dedicated upload for categories to uploads/shared/categories
 * @access  Private
 */
router.post('/upload/category',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    req.uploadFolder = 'uploads/shared/categories';
    next();
  },
  upload.single('file'),
  commonController.uploadSingle
);

/**
 * @route   POST /api/common/upload/mascot
 * @desc    Dedicated upload for category mascots to uploads/shared/categories-mascot
 * @access  Private
 */
router.post('/upload/mascot',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    req.uploadFolder = 'uploads/shared/categories-mascot';
    next();
  },
  upload.single('file'),
  commonController.uploadSingle
);


/**
 * @route   POST /api/common/upload/ad
 * @desc    Dedicated upload for Home Page Advertisements to uploads/shared/ads
 * @access  Private
 */
router.post('/upload/ad',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    req.uploadFolder = 'uploads/shared/ads';
    next();
  },
  upload.single('file'),
  commonController.uploadSingle
);

module.exports = router;
