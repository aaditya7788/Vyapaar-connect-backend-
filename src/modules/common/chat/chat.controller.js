const chatService = require('./chat.service');

const getHistory = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { limit, before } = req.query;
        const history = await chatService.getHistory(roomId, limit ? parseInt(limit) : 50, before);
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getRoom = async (req, res) => {
    try {
        const { bookingId } = req.params;
        console.log(`🏠 [ChatController] Resolving room for Booking: ${bookingId}`);
        const room = await chatService.getOrCreateRoom(bookingId);
        console.log(`✅ [ChatController] Resolved Room: ${room.id}`);
        res.json({ success: true, data: room });
    } catch (error) {
        console.error(`❌ [ChatController] Error resolving room:`, error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const syncHistory = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { since } = req.query;
        if (!since) return res.status(400).json({ success: false, message: 'since timestamp required' });
        
        const messages = await chatService.getNewMessagesSince(roomId, since);
        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateApproval = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body; // APPROVED, DECLINED
        const message = await chatService.updateMessageApproval(messageId, status);
        res.json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        const { content, type, customServiceData } = req.body;
        
        if (!content && type !== 'CUSTOM_SERVICE') {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        const message = await chatService.sendMessage(roomId, userId, { content, type: type || 'TEXT', customServiceData });
        res.json({ success: true, data: message });
    } catch (error) {
        console.error(`❌ [ChatController] Error sending REST message:`, error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getUserRooms = async (req, res) => {
    try {
        const userId = req.user.id;
        const roles = req.user.roles || [];
        const { page, limit, includeAll } = req.query;
        
        const result = await chatService.getUserRooms(
            userId, 
            roles, 
            includeAll === 'true', 
            page ? parseInt(page) : 1, 
            limit ? parseInt(limit) : 15
        );
        
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const searchByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const room = await chatService.getOrCreateRoom(bookingId);
        const history = await chatService.getHistory(room.id, 100);
        res.json({ 
            success: true, 
            data: {
                room,
                history
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getHistory,
    getRoom,
    syncHistory,
    updateApproval,
    sendMessage,
    getUserRooms,
    searchByBooking
};
