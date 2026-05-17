const prisma = require('../../../db');

/**
 * @desc Search users by name, phone, or email
 * @route GET /api/admin/users/search
 */
exports.searchUsers = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { fullName: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                ],
            },
            select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                avatar: true,
                roles: true,
            },
            take: 20,
        });

        res.status(200).json({ status: 'success', data: users });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get all users with advanced filtering and pagination
 * @route GET /api/admin/users/list
 */
exports.listUsers = async (req, res) => {
    try {
        const { role, status, q, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        
        // Role filter (case-insensitive array check)
        if (role) {
            where.roles = { has: role.toLowerCase() };
        }
        
        // Status filter
        if (status) {
            where.status = status.toLowerCase();
        }

        // Search query
        if (q) {
            where.OR = [
                { fullName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { customerId: { contains: q, mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    email: true,
                    avatar: true,
                    roles: true,
                    status: true,
                    createdAt: true,
                    remarkScore: true,
                    isProfileComplete: true,
                    customerId: true,
                    providerId: true,
                    _count: {
                        select: { 
                            bookings: true,
                            refreshTokens: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.user.count({ where })
        ]);

        res.status(200).json({ 
            status: 'success', 
            data: users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get detailed activity for a user
 * @route GET /api/admin/users/:id/activity
 */
exports.getUserActivity = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        
        const [logins, bookings, transactions, notifications, searches] = await Promise.all([
            prisma.refreshToken.findMany({
                where: { userId: id, createdAt: { gte: fourteenDaysAgo } },
                orderBy: { createdAt: 'desc' },
                select: { id: true, deviceName: true, platform: true, lastActive: true, createdAt: true }
            }),
            prisma.booking.findMany({
                where: { userId: id, createdAt: { gte: fourteenDaysAgo } },
                orderBy: { createdAt: 'desc' },
                include: { shop: { select: { name: true } } }
            }),
            prisma.creditTransaction.findMany({
                where: { userId: id, createdAt: { gte: fourteenDaysAgo } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.notification.findMany({
                where: { userId: id, createdAt: { gte: fourteenDaysAgo } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.searchLog.findMany({
                where: { userId: id, createdAt: { gte: fourteenDaysAgo } },
                orderBy: { createdAt: 'desc' }
            })
        ]);

        const activities = [
            ...logins.map(l => ({ id: l.id, type: 'SECURITY', title: 'User Login', description: `Login from ${l.platform || 'Unknown Device'}`, time: l.createdAt, metadata: { device: l.deviceName } })),
            ...bookings.map(b => ({ id: b.id, type: 'BOOKING', title: 'Service Booked', description: `Booked at ${b.shop.name}`, time: b.createdAt, metadata: { amount: b.totalAmount, status: b.status, displayId: b.displayId } })),
            ...transactions.map(t => ({ id: t.id, type: 'WALLET', title: `Wallet ${t.type}`, description: t.description || `${t.amount} coins ${t.type.toLowerCase()}`, time: t.createdAt, metadata: { amount: t.amount, status: t.status } })),
            ...notifications.map(n => ({ id: n.id, type: 'NOTIFICATION', title: n.title, description: n.body, time: n.createdAt, metadata: { type: n.type } })),
            ...searches.map(s => ({ id: s.id, type: 'SEARCH', title: 'Search Query', description: `Searched for: "${s.query}"`, time: s.createdAt, metadata: { query: s.query } }))
        ];

        // Apply Search Filtering if query exists
        const { q } = req.query;
        let filteredActivities = activities;
        if (q) {
            const query = q.toLowerCase();
            filteredActivities = activities.filter(a => 
                a.title.toLowerCase().includes(query) || 
                a.description.toLowerCase().includes(query) ||
                a.type.toLowerCase().includes(query)
            );
        }

        const sortedActivities = filteredActivities.sort((a, b) => new Date(b.time) - new Date(a.time));

        const total = sortedActivities.length;
        const paginatedActivities = sortedActivities.slice(skip, skip + take);

        res.status(200).json({ 
            status: 'success', 
            data: paginatedActivities,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get comprehensive user details for profile view
 * @route GET /api/admin/users/:id
 */
exports.getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const [
            user, 
            spentStats, 
            wallet, 
            recentBookings, 
            transactions, 
            reviews,
            creditSpendStats,
            coinUsageStats
        ] = await Promise.all([
            prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    email: true,
                    avatar: true,
                    roles: true,
                    status: true,
                    createdAt: true,
                    remarkScore: true,
                    customerId: true,
                    providerId: true,
                    twoFactorEnabled: true,
                    providerProfile: {
                        select: {
                            id: true,
                            shops: {
                                select: {
                                    id: true,
                                    name: true,
                                    category: true,
                                    status: true,
                                    profileImage: true,
                                    backgroundImages: true,
                                    averageRating: true,
                                    createdAt: true,
                                    _count: { select: { services: true, bookings: true } }
                                }
                            }
                        }
                    },
                    _count: {
                        select: { bookings: true }
                    }
                }
            }),
            prisma.booking.aggregate({
                where: { userId: id, status: 'COMPLETED' },
                _sum: { totalAmount: true }
            }),
            prisma.userCredits.findUnique({
                where: { userId: id }
            }),
            prisma.booking.findMany({
                where: { userId: id },
                include: {
                    shop: {
                        select: { name: true }
                    },
                    items: {
                        include: {
                            service: {
                                select: { name: true, unit: true, image: true }
                            }
                        }
                    },
                    address: true
                },
                orderBy: { createdAt: 'desc' },
                take: 5
            }),
            prisma.creditTransaction.findMany({
                where: { userId: id },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            prisma.review.findMany({
                where: { userId: id },
                include: {
                    shop: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            // 7. All credit orders (status agnostic for debug)
            prisma.creditOrder.findMany({
                where: { userId: id }
            }),
            // 8. All credit transactions (status agnostic for debug)
            prisma.creditTransaction.findMany({
                where: { userId: id }
            })
        ]);

        // Calculate metrics manually
        const _totalSpentOnCredits = creditSpendStats
            .filter(o => o.status === 'paid' || o.status === 'SUCCESS' || o.status === 'COMPLETED')
            .reduce((sum, o) => sum + (o.amount || 0), 0);
            
        const _totalCreditsPurchased = coinUsageStats
            .filter(t => (t.type === 'PURCHASE' || t.type === 'BONUS') && t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);

        const _totalCreditsUsed = Math.abs(
            coinUsageStats
                .filter(t => t.amount < 0)
                .reduce((sum, t) => sum + t.amount, 0)
        );

        // Final Metrics
        const totalSpentOnCredits = _totalSpentOnCredits;
        const totalCreditsPurchased = _totalCreditsPurchased;
        const totalCreditsUsed = _totalCreditsUsed;

        if (!user) {
            return res.status(404).json({ status: 'fail', message: 'User not found' });
        }

        const { twoFactorEnabled, ...userData } = user;

        res.status(200).json({ 
            status: 'success', 
            data: {
                ...userData,
                mfaEnabled: twoFactorEnabled,
                totalSpent: spentStats._sum.totalAmount || 0,
                totalSpentOnCredits,
                totalCreditsPurchased,
                totalCreditsUsed,
                walletBalance: wallet?.balance || 0,
                recentBookings: recentBookings.map(b => ({
                    id: b.id,
                    displayId: b.displayId,
                    title: b.shop.name,
                    date: b.scheduledDate,
                    time: b.scheduledTime,
                    status: b.status,
                    amount: b.totalAmount,
                    address: b.address ? `${b.address.name || ''} ${b.address.address}, ${b.address.area || ''}`.trim() : 'N/A',
                    items: b.items.map(item => ({
                        id: item.id,
                        name: item.service.name,
                        quantity: item.quantity,
                        unit: item.service.unit,
                        price: item.price,
                        image: item.service.image
                    }))
                })),
                transactions: transactions.map(t => ({
                    id: t.id,
                    amount: t.amount,
                    type: t.type,
                    description: t.description,
                    status: t.status,
                    createdAt: t.createdAt
                })),
                reviews: reviews.map(r => ({
                    id: r.id,
                    rating: r.overallRating,
                    comment: r.comment,
                    shopName: r.shop.name,
                    createdAt: r.createdAt
                }))
            } 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get paginated bookings for a specific user
 * @route GET /api/admin/users/:id/bookings
 */
exports.getUserBookings = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, status, q } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = { userId: id };
        
        if (status) {
            where.status = status;
        }

        if (q) {
            where.OR = [
                { displayId: { contains: q, mode: 'insensitive' } },
                { shop: { name: { contains: q, mode: 'insensitive' } } }
            ];
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                include: {
                    shop: {
                        select: { name: true }
                    },
                    items: {
                        include: {
                            service: {
                                select: { name: true, unit: true, image: true }
                            }
                        }
                    },
                    address: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.booking.count({ where })
        ]);

        res.status(200).json({
            status: 'success',
            data: bookings.map(b => ({
                id: b.id,
                displayId: b.displayId,
                title: b.shop.name,
                date: b.scheduledDate,
                time: b.scheduledTime,
                status: b.status,
                amount: b.totalAmount,
                address: b.address ? `${b.address.name || ''} ${b.address.address}, ${b.address.area || ''}`.trim() : 'N/A',
                items: b.items.map(item => ({
                    id: item.id,
                    name: item.service.name,
                    quantity: item.quantity,
                    unit: item.service.unit,
                    price: item.price,
                    image: item.service.image
                }))
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get paginated wallet transactions for a specific user
 * @route GET /api/admin/users/:id/transactions
 */
exports.getUserTransactions = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, type, q } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = { userId: id };
        if (type) where.type = type;
        if (q) {
            where.description = { contains: q, mode: 'insensitive' };
        }

        const [transactions, total] = await Promise.all([
            prisma.creditTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.creditTransaction.count({ where })
        ]);
        // Fetch associated orders for PURCHASE transactions
        const transactionsWithOrders = await Promise.all(
            transactions.map(async (tx) => {
                if (tx.type === 'PURCHASE' && tx.orderId) {
                    try {
                        const order = await prisma.creditOrder.findUnique({
                            where: { id: tx.orderId }
                        });
                        return { ...tx, order };
                    } catch (e) {
                        return tx;
                    }
                }
                return tx;
            })
        );

        res.status(200).json({
            status: 'success',
            data: transactionsWithOrders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const authService = require('../../auth/auth/auth.service');

/**
 * @desc Block/Unblock user
 * @route PATCH /api/admin/users/:id/status
 */
exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, blockReason } = req.body;

        if (!['active', 'blocked'].includes(status)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid status' });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { 
                status, 
                blockReason: status === 'blocked' ? blockReason : null 
            }
        });

        // If blocking, kill all sessions and send a real-time signal via FCM/Socket
        if (status === 'blocked') {
            await prisma.refreshToken.deleteMany({ where: { userId: id } });
            await authService.notifyOtherDevicesOfLogout(id);
        }

        res.status(200).json({ status: 'success', data: user });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
