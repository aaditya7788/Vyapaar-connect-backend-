const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth/auth.routes');
const providerRoutes = require('../modules/provider/provider/provider.routes');
const userRoutes = require('../modules/auth/user/user.routes');
const communityRoutes = require('../modules/common/community/community.routes');
const commonRoutes = require('../modules/common/common/common.routes');
const serviceRoutes = require('../modules/provider/service/service.routes');
const categoryRoutes = require('../modules/common/category/category.routes');
const discoveryRoutes = require('../modules/customer/discovery/discovery.routes');
const bookingRoutes = require('../modules/common/booking/booking.routes');
const adminRoutes = require('../modules/common/admin/admin.routes');
const adminWalletRoutes = require('../modules/admin/wallet/wallet.routes');
const adminNotificationRoutes = require('../modules/admin/notification/notification.routes');
const adminUserRoutes = require('../modules/admin/user/user.routes');
const adminSettingsRoutes = require('../modules/admin/settings/settings.routes');
const addressRoutes = require('../modules/customer/address/address.routes');
const walletRoutes = require('../modules/provider/wallet/wallet.routes');
const analyticsRoutes = require('../modules/provider/analytics/analytics.routes');
const slotRoutes = require('../modules/provider/slots/slot.routes');
const commonSettingsRoutes = require('../modules/common/settings/settings.routes');

// Health Check
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Vyapaar Connect API is healthy' });
});

// App Config (Public)
router.use('/app', commonSettingsRoutes);

// Admin Routes (Developer Settings)
router.use('/admin', adminRoutes);
router.use('/admin/wallet', adminWalletRoutes);
router.use('/admin/notifications', adminNotificationRoutes);
router.use('/admin/users', adminUserRoutes);
router.use('/admin/settings', adminSettingsRoutes);

// Auth Routes
router.use('/auth', authRoutes);

// Provider Routes (Includes Upgrade Flow)
router.use('/provider', providerRoutes);
router.use('/provider/wallet', walletRoutes);
router.use('/provider/analytics', analyticsRoutes);
router.use('/provider/slots', slotRoutes);

// Service Routes
router.use('/service', serviceRoutes);

// Category Routes
router.use('/category', categoryRoutes);

// User Profile Routes
router.use('/user', userRoutes);
router.use('/user/addresses', addressRoutes);


// Community Routes
router.use('/communities', communityRoutes);

// Shared Routes
router.use('/common', commonRoutes);

// Discovery Routes (Customer Side Search/Home)
router.use('/discovery', discoveryRoutes);

// Booking Lifecycle Routes
router.use('/bookings', bookingRoutes);

// Customer Review & Recommendation Routes
const reviewRoutes = require('../modules/customer/review/review.routes');
const recommendRoutes = require('../modules/customer/recommend/recommend.routes');
router.use('/customer/reviews', reviewRoutes);
router.use('/customer/recommend', recommendRoutes);

// Chat Routes
const chatRoutes = require('../modules/common/chat/chat.routes');
router.use('/chat', chatRoutes);

// Call Routes
const callRoutes = require('../modules/common/call/call.routes');
router.use('/calls', callRoutes);

module.exports = router;
