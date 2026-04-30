const callService = require('./call.service');

class CallController {
    /**
     * Initiate a call
     */
    async initiate(req, res) {
        try {
            const userId = req.user.id;
            const { bookingId, receiverId } = req.body;

            if (!bookingId) {
                return res.status(400).json({ error: 'bookingId is required' });
            }

            const result = await callService.initiateCall(userId, { bookingId, receiverId });

            // Note: FCM Signaling will be triggered from here in the next plan

            res.status(201).json({ status: 'success', data: result });
        } catch (error) {
            console.error('Call initiation error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Update call status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, duration } = req.body;

            const updatedCall = await callService.updateCallStatus(id, status, duration);
            res.status(200).json({ status: 'success', data: updatedCall });
        } catch (error) {
            console.error('Call status update error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Unlock call early
     */
    async unlock(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const updatedBooking = await callService.unlockCall(id, userId);
            res.status(200).json({ 
                status: 'success', 
                message: 'Call unlocked successfully',
                data: updatedBooking 
            });
        } catch (error) {
            console.error('Call unlock error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Get call details
     */
    async detail(req, res) {
        try {
            const { id } = req.params;
            const call = await callService.getCallById(id);

            if (!call) {
                return res.status(404).json({ error: 'Call not found' });
            }

            res.status(200).json({ status: 'success', data: call });
        } catch (error) {
            console.error('Call detail fetch error:', error);
            res.status(500).json({ error: 'Error fetching call details' });
        }
    }
}

module.exports = new CallController();
