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
    const subfolder = req.query.subfolder || '';
    // Construct path: uploads/common + optional subfolder
    req.uploadFolder = path.join('uploads/common', subfolder).replace(/\\/g, '/');
    next();
  },
  upload.single('file'), 
  commonController.uploadSingle
);

/**
 * @route   POST /api/common/upload/category
 * @desc    Dedicated upload for categories/subcategories to uploads/shared/services
 * @access  Private
 */
router.post('/upload/category',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    req.uploadFolder = 'uploads/shared/services';
    next();
  },
  upload.single('file'),
  commonController.uploadSingle
);


/**
 * @route   POST /api/common/upload/ad
 * @desc    Dedicated upload for Home Page Advertisements to uploads/ads
 * @access  Private
 */
router.post('/upload/ad',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    req.uploadFolder = 'uploads/ads';
    next();
  },
  upload.single('file'),
  commonController.uploadSingle
);

module.exports = router;
