const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authMiddleware, adminMiddleware } = require('../../../middleware/auth.middleware');

const multer = require('multer');
const { upload } = require('../../../middleware/upload');

const { uploadToS3 } = require('../../../utils/s3Service');

// Apply admin guard to all notification routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Specialized uploader for Campaigns: Max 300 KB
const campaignUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 300 * 1024 }, // 300 KB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG and WebP are allowed'), false);
        }
    }
}).single('image');

const { normalizeUrl } = require('../../common/booking/booking.notification');

/**
 * @route   POST /api/admin/notifications/upload
 * @desc    Upload notification assets
 * @access  Admin Only
 */
router.post('/upload',
    (req, res, next) => { req.uploadFolder = 'Shared/notifications'; next(); },
    (req, res, next) => {
        campaignUpload(req, res, (err) => {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ status: 'fail', message: 'Image too large. Please use an image under 300 KB for push notifications.' });
            } else if (err) {
                return res.status(400).json({ status: 'fail', message: err.message });
            }
            next();
        });
    },
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ status: 'fail', message: 'No file uploaded' });
            }

            const s3Path = await uploadToS3(
                req.file.buffer,
                req.file.originalname,
                req.uploadFolder,
                req.file.mimetype
            );

            // Convert relative S3 path to absolute URL for immediate use in Mission Control
            const fullUrl = normalizeUrl(s3Path);

            res.status(200).json({ 
                status: 'success', 
                imageUrl: fullUrl,
                relativePath: s3Path // Also provide relative path for DB persistence if needed
            });
        } catch (error) {
            console.error('[Notification Upload Error]:', error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    }
);

/**
 * @route   POST /api/admin/notifications/dispatch
 * @desc    Launch a push notification campaign
 * @access  Admin Only
 */
router.post('/dispatch', notificationController.dispatchNotification);

module.exports = router;
