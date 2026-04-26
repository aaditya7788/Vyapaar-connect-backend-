const bookingService = require('./booking.service');

/**
 * TITLE: Global Booking Controller
 * DESCRIPTION: Handles the core booking lifecycle, including creation, listing, status updates, 
 * and detail retrieval for both customers and providers. It acts as the central hub 
 * for all transactional service requests.
 */
class BookingController {
    /**
     * Create multiple bookings from a cart bucket
     */
    async create(req, res) {
        try {
            const { shopId, addressId, scheduledDate, scheduledTime, services } = req.body;
            const userId = req.user.id; // From auth middleware

            if (!services || !Array.isArray(services)) {
                return res.status(400).json({ error: 'Services must be an array' });
            }

            const bookings = await bookingService.createBookings({
                userId, shopId, addressId, scheduledDate, scheduledTime, services
            });

            res.status(201).json({ status: 'success', data: bookings });
        } catch (error) {
            console.error('Booking creation error:', error);
            res.status(500).json({ error: error.message || 'Error creating bookings' });
        }
    }

    /**
     * Get bookings for a provider's shop
     */
    async listForProvider(req, res) {
        try {
            const userId = req.user.id;
            const { shopId } = req.query;

            if (!shopId) {
                return res.status(400).json({ error: 'shopId is required' });
            }

            const bookings = await bookingService.getProviderBookings(userId, shopId, req.query);
            res.status(200).json({ status: 'success', ...bookings });
        } catch (error) {
            console.error('Provider booking fetch error:', error);
            
            if (error.message === 'Unauthorized or shop not found') {
                return res.status(error.message.includes('found') ? 404 : 403).json({ error: error.message });
            }
            
            res.status(500).json({ error: error.message || 'Error fetching bookings' });
        }
    }

    /**
     * Get all bookings for the current user (Customer)
     */
    async list(req, res) {
        try {
            const userId = req.user.id;
            const bookings = await bookingService.getCustomerBookings(userId, req.query);
            res.status(200).json({ status: 'success', ...bookings });
        } catch (error) {
            console.error('Booking fetch error:', error);
            res.status(500).json({ error: 'Error fetching bookings' });
        }
    }

    /**
     * Get single booking details
     */
    async detail(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const booking = await bookingService.getBookingById(id, userId);

            if (!booking) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            res.status(200).json({ status: 'success', data: booking });
        } catch (error) {
            console.error('Booking detail fetch error:', error);
            res.status(500).json({ error: 'Error fetching booking details' });
        }
    }

    /**
     * Update booking status (e.g. CANCELLED by customer)
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, completionOtp } = req.body;
            const userId = req.user.id;

            const updatedBooking = await bookingService.updateStatus(id, userId, status, completionOtp);
            res.status(200).json({ status: 'success', data: updatedBooking });
        } catch (error) {
            console.error('Booking status update error:', error);
            res.status(400).json({ error: error.message || 'Error updating status' });
        }
    }

    /**
     * POST /booking/retry/:id
     * Retry an expired booking
     */
    async retryBooking(req, res) {
        try {
            const { id } = req.params;
            const booking = await bookingService.retryBooking(id, req.user.id);
            res.status(200).json({ status: 'success', data: booking });
        } catch (error) {
            console.error('Booking retry error:', error);
            res.status(400).json({ error: error.message || 'Error retrying booking' });
        }
    }
}

module.exports = new BookingController();
