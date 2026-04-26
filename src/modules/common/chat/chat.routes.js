const express = require('express');
const router = express.Router();
const chatController = require('./chat.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/rooms', chatController.getUserRooms);
router.get('/:roomId/history', chatController.getHistory);
router.post('/:roomId/messages', chatController.sendMessage);
router.get('/:roomId/sync', chatController.syncHistory);
router.get('/booking/:bookingId', chatController.getRoom);
router.get('/search/booking/:bookingId', chatController.searchByBooking);
router.patch('/messages/:messageId/approval', chatController.updateApproval);

module.exports = router;
