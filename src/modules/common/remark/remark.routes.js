const express = require('express');
const router = express.Router();
const remarkController = require('./remark.controller');
const { authMiddleware, requireRole } = require('../../../middleware/auth.middleware');

// All remark routes require login
router.use(authMiddleware);

// Users/Providers can report each other
router.post('/report', remarkController.reportTarget);

// Users can view their own history and appeal
router.get('/history/me', remarkController.getMyRemarks);
router.post('/:remarkId/appeal', remarkController.appealRemark);

// Only Admins can view full remark history and moderate
router.get('/all', requireRole('admin'), remarkController.getAllRemarks);
router.get('/:targetId', requireRole('admin'), remarkController.getTargetRemarks);
router.patch('/:remarkId/moderate', requireRole('admin'), remarkController.moderateRemark);

module.exports = router;
