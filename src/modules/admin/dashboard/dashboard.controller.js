const prisma = require('../../../db');

/**
 * @desc Get high-level platform statistics
 * @route GET /api/admin/dashboard/stats
 */
exports.getStats = async (req, res) => {
    try {
        const { days, startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            const d = parseInt(days) || 30;
            start = new Date();
            start.setDate(start.getDate() - d);
            end = new Date();
        }

        const [
            platformRevenue,
            serviceVolume,
            totalBookings,
            activeShops,
            newUsers,
            spentCoins,
            // Previous Period Stats
            prevPlatformRevenue,
            prevServiceVolume,
            prevTotalBookings,
            prevNewUsers,
            prevSpentCoins
        ] = await Promise.all([
            // Platform Revenue (Real money from buying credits)
            prisma.creditOrder.aggregate({
                where: { status: 'paid', createdAt: { gte: start, lte: end } },
                _sum: { amount: true }
            }),
            // Service Volume / GMV (Total value of bookings)
            prisma.booking.aggregate({
                where: { createdAt: { gte: start, lte: end } },
                _sum: { totalAmount: true }
            }),
            // Bookings count
            prisma.booking.count({
                where: { createdAt: { gte: start, lte: end } }
            }),
            // Active verified shops (Snapshot, no historical change for now)
            prisma.shop.count({
                where: { status: 'VERIFIED', isFrozen: false }
            }),
            // New users
            prisma.user.count({
                where: { createdAt: { gte: start, lte: end } }
            }),
            // Spent Coins
            prisma.creditTransaction.aggregate({
                where: { type: 'USED', status: 'SUCCESS', createdAt: { gte: start, lte: end } },
                _sum: { amount: true }
            }),
            
            // PREVIOUS PERIOD QUERIES
            prisma.creditOrder.aggregate({
                where: { status: 'paid', createdAt: { gte: new Date(start.getTime() - (end - start)), lte: start } },
                _sum: { amount: true }
            }),
            prisma.booking.aggregate({
                where: { createdAt: { gte: new Date(start.getTime() - (end - start)), lte: start } },
                _sum: { totalAmount: true }
            }),
            prisma.booking.count({
                where: { createdAt: { gte: new Date(start.getTime() - (end - start)), lte: start } }
            }),
            prisma.user.count({
                where: { createdAt: { gte: new Date(start.getTime() - (end - start)), lte: start } }
            }),
            prisma.creditTransaction.aggregate({
                where: { type: 'USED', status: 'SUCCESS', createdAt: { gte: new Date(start.getTime() - (end - start)), lte: start } },
                _sum: { amount: true }
            })
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                platformRevenue: platformRevenue._sum.amount || 0,
                serviceVolume: serviceVolume._sum.totalAmount || 0,
                totalBookings,
                activeShops,
                newUsers,
                spentCoins: Math.abs(spentCoins._sum.amount || 0),
                prev: {
                    platformRevenue: prevPlatformRevenue._sum.amount || 0,
                    serviceVolume: prevServiceVolume._sum.totalAmount || 0,
                    totalBookings: prevTotalBookings,
                    newUsers: prevNewUsers,
                    spentCoins: Math.abs(prevSpentCoins._sum.amount || 0)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get booking trends for explicit range
 */
exports.getTrends = async (req, res) => {
    try {
        const { days, startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            const d = parseInt(days) || 7;
            start = new Date();
            start.setDate(start.getDate() - d);
            end = new Date();
        }

        const bookings = await prisma.booking.findMany({
            where: { createdAt: { gte: start, lte: end } },
            select: { createdAt: true, status: true }
        });

        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const trends = {};
        for (let i = 0; i <= diffDays; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            const dayStr = date.toISOString().split('T')[0];
            trends[dayStr] = { day: dayStr, bookings: 0, completed: 0 };
        }

        bookings.forEach(b => {
            const dayStr = b.createdAt.toISOString().split('T')[0];
            if (trends[dayStr]) {
                trends[dayStr].bookings++;
                if (b.status === 'COMPLETED') {
                    trends[dayStr].completed++;
                }
            }
        });

        res.status(200).json({
            status: 'success',
            data: Object.values(trends)
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get category stats for explicit range
 */
exports.getCategoryStats = async (req, res) => {
    try {
        const { days, startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            const d = parseInt(days) || 30;
            start = new Date();
            start.setDate(start.getDate() - d);
            end = new Date();
        }

        const categoryData = await prisma.booking.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: {
                shop: {
                    select: { category: true }
                }
            }
        });

        const stats = {};
        categoryData.forEach(b => {
            const cat = b.shop?.category || 'Uncategorized';
            if (!stats[cat]) {
                stats[cat] = { name: cat, count: 0, revenue: 0 };
            }
            stats[cat].count++;
            stats[cat].revenue += b.totalAmount || 0;
        });

        const totalRevenue = Object.values(stats).reduce((sum, s) => sum + s.revenue, 0);
        
        let result = Object.values(stats)
            .sort((a, b) => b.revenue - a.revenue);

        if (result.length > 6) {
            const top5 = result.slice(0, 5);
            const others = result.slice(5);
            const othersRevenue = others.reduce((sum, s) => sum + s.revenue, 0);
            const othersCount = others.reduce((sum, s) => sum + s.count, 0);
            
            result = [
                ...top5,
                { name: 'Others', count: othersCount, revenue: othersRevenue }
            ];
        }

        result = result.map(s => ({
            ...s,
            value: totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0
        }));

        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/**
 * @desc Get unified recent activity feed (Real Logs)
 */
exports.getActivity = async (req, res) => {
    try {
        const [recentBookings, recentShops, recentTransactions] = await Promise.all([
            prisma.booking.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { 
                    user: { select: { fullName: true } },
                    shop: { select: { name: true } }
                }
            }),
            prisma.shop.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                select: { name: true, createdAt: true, status: true }
            }),
            prisma.creditTransaction.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { fullName: true } } }
            })
        ]);

        const activities = [
            ...recentBookings.map(b => ({
                id: `booking-${b.id}`,
                type: 'booking',
                message: `${b.user?.fullName || 'Customer'} booked ${b.shop?.name || 'Service'}`,
                time: b.createdAt,
                status: b.status
            })),
            ...recentShops.map(s => ({
                id: `shop-${s.id}`,
                type: 'shop',
                message: `Shop '${s.name}' ${s.status === 'PENDING' ? 'registered' : 'verified'}`,
                time: s.createdAt,
                status: s.status
            })),
            ...recentTransactions.map(t => ({
                id: `tx-${t.id}`,
                type: 'wallet',
                message: `${t.user?.fullName || 'Provider'} ${t.type === 'USED' ? 'spent' : 'bought'} ${Math.abs(t.amount)} coins`,
                time: t.createdAt,
                status: t.status
            }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 15);

        res.status(200).json({ status: 'success', data: activities });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
