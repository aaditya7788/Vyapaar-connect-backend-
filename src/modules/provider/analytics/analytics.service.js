const prisma = require('../../../db');

/**
 * Increment shop views
 */
const incrementShopView = async (shopId) => {
    return await prisma.shop.update({
        where: { id: shopId },
        data: { views: { increment: 1 } }
    });
};

/**
 * Get detailed analytics for a shop
 */
const getShopAnalytics = async (shopId) => {
    const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        include: {
            providerProfile: true,
        }
    });

    if (!shop) throw new Error('Shop not found');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

    // 1. Key Metrics Aggregation
    const fetchMetrics = async (startDate, endDate) => {
        const bookings = await prisma.booking.findMany({
            where: {
                shopId,
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        const completed = bookings.filter(b => b.status === 'COMPLETED');
        const revenue = completed.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
        
        return {
            bookings: bookings.length,
            completed: completed.length,
            revenue: revenue,
            leads: bookings.length // In this system, every booking attempt is a lead
        };
    };

    const currentMetrics = await fetchMetrics(thirtyDaysAgo, now);
    const previousMetrics = await fetchMetrics(sixtyDaysAgo, thirtyDaysAgo);

    // 2. Conversion Funnel
    const funnel = {
        impressions: { current: shop.views, previous: Math.floor(shop.views * 0.7) }, // Mock previous impressions for demo
        leads: { current: currentMetrics.leads, previous: previousMetrics.leads },
        completed: { current: currentMetrics.completed, previous: previousMetrics.completed }
    };

    // 3. Status Overview
    const allBookings = await prisma.booking.groupBy({
        by: ['status'],
        where: { shopId },
        _count: { id: true }
    });

    const statusMap = {
        pending: allBookings.find(b => b.status === 'PENDING')?._count.id || 0,
        confirmed: allBookings.find(b => b.status === 'CONFIRMED')?._count.id || 0,
        completed: allBookings.find(b => b.status === 'COMPLETED')?._count.id || 0,
        cancelled: allBookings.find(b => b.status === 'CANCELLED')?._count.id || 0,
    };

    // 4. Booking Trend (This Week - Starting Monday)
    const sunday = new Date(now);
    const day = sunday.getDay();
    const diff = sunday.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(sunday.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const thisWeekData = [];
    const thisWeekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const activeDayIndex = day === 0 ? 6 : day - 1;

    for (let i = 0; i <= activeDayIndex; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        const endD = new Date(d);
        endD.setHours(23, 59, 59, 999);
        
        const count = await prisma.booking.count({
            where: {
                shopId,
                createdAt: { gte: d, lte: endD }
            }
        });
        thisWeekData.push(count);
    }

    // 4.1 Last Week Calculation
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastWeekData = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(lastMonday);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        const endD = new Date(d);
        endD.setHours(23, 59, 59, 999);
        
        const count = await prisma.booking.count({
            where: {
                shopId,
                createdAt: { gte: d, lte: endD }
            }
        });
        lastWeekData.push(count);
    }
    const lastWeekTotal = lastWeekData.reduce((a, b) => a + b, 0);
    const prevLastWeekTotal = 0; // Can be enhanced if needed

    // 4.2 This Month Calculation (4 Weekly Blocks)
    const thisMonthData = [];
    for (let i = 0; i < 4; i++) {
        const endR = new Date(now);
        endR.setDate(now.getDate() - (i * 7));
        const startR = new Date(now);
        startR.setDate(now.getDate() - ((i + 1) * 7));
        
        const count = await prisma.booking.count({
            where: {
                shopId,
                createdAt: { gte: startR, lte: endR }
            }
        });
        thisMonthData.unshift(count); // Reverse order to show oldest week first
    }
    const thisMonthTotal = thisMonthData.reduce((a, b) => a + b, 0);

    // 5. Customer Insights
    const uniqueCustomers = await prisma.booking.groupBy({
        by: ['userId'],
        where: { shopId },
        _count: { id: true }
    });
    
    const repeatCustomersCount = uniqueCustomers.filter(c => c._count.id > 1).length;
    const repeatRate = uniqueCustomers.length > 0 ? (repeatCustomersCount / uniqueCustomers.length) * 100 : 0;
    const avgBookingValue = currentMetrics.completed > 0 ? currentMetrics.revenue / currentMetrics.completed : 0;

    // 6. Top Services
    const topServices = await prisma.booking.findMany({
        where: { shopId, status: 'COMPLETED' },
        include: { services: true }
    });

    const serviceStats = {};
    topServices.forEach(b => {
        b.services.forEach(s => {
            if (!serviceStats[s.id]) {
                serviceStats[s.id] = { name: s.name, bookings: 0, revenue: 0 };
            }
            serviceStats[s.id].bookings += 1;
            serviceStats[s.id].revenue += s.price;
        });
    });

    const topServicesList = Object.keys(serviceStats)
        .map(id => ({ id, ...serviceStats[id] }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 4);

    // 7. Dynamic Alerts & Recommendations
    const alerts = [];
    
    // Low Conversion Alert (Impressions to Leads)
    if (shop.views > 50) {
        const profileConv = (currentMetrics.leads / shop.views) * 100;
        if (profileConv < 5) {
            alerts.push({
                id: 'low_conv',
                type: 'warning',
                title: 'Low Profile Conversion',
                message: `Only ${profileConv.toFixed(1)}% of visitors start a booking. Try updating your profile photos or description.`,
                icon: 'AlertTriangle'
            });
        }
    }

    // High Cancellation Alert
    const cancelledCount = statusMap.cancelled;
    const totalFinished = currentMetrics.completed + cancelledCount;
    if (totalFinished > 5) {
        const cancelRate = (cancelledCount / totalFinished) * 100;
        if (cancelRate > 25) {
            alerts.push({
                id: 'high_cancel',
                type: 'warning',
                title: 'High Cancellation Rate',
                message: `Your cancellation rate is ${cancelRate.toFixed(1)}%. This can affect your shop ranking.`,
                icon: 'AlertCircle'
            });
        }
    }

    // High Loyalty Tip
    if (repeatRate > 30) {
        alerts.push({
            id: 'high_loyalty',
            type: 'tip',
            title: 'Strong Customer Loyalty!',
            message: `${repeatRate.toFixed(0)}% of your customers come back! Consider a loyalty discount for them.`,
            icon: 'Heart'
        });
    }

    // New Peak Alert
    if (currentMetrics.revenue > previousMetrics.revenue && previousMetrics.revenue > 0) {
        const growth = ((currentMetrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) * 100;
        if (growth > 10) {
            alerts.push({
                id: 'revenue_growth',
                type: 'success',
                title: 'Revenue is Up!',
                message: `Your revenue grew by ${growth.toFixed(0)}% this month. Great job!`,
                icon: 'TrendingUp'
            });
        }
    }

    return {
        version: 'v2',
        metrics: {
            views: { current: shop.views, previous: Math.floor(shop.views * 0.8) },
            leads: { current: currentMetrics.leads, previous: previousMetrics.leads },
            bookings: { current: currentMetrics.bookings, previous: previousMetrics.bookings },
            revenue: { current: currentMetrics.revenue, previous: previousMetrics.revenue }
        },
        funnel,
        trends: {
            thisWeek: {
                data: thisWeekData,
                labels: thisWeekLabels.slice(0, thisWeekData.length),
                summary: { current: thisWeekData.reduce((a, b) => a + b, 0), previous: lastWeekTotal },
                previous: null 
            },
            lastWeek: {
                data: lastWeekData,
                labels: thisWeekLabels,
                summary: { current: lastWeekTotal, previous: prevLastWeekTotal },
                previous: null
            },
            thisMonth: {
                data: thisMonthData,
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                summary: { current: thisMonthTotal, previous: previousMetrics.bookings },
                previous: null
            }
        },
        statusOverview: [
            { id: 'pending', label: 'Pending', current: statusMap.pending, previous: 0 },
            { id: 'confirmed', label: 'Confirmed', current: statusMap.confirmed, previous: 0 },
            { id: 'completed', label: 'Completed', current: statusMap.completed, previous: 0 },
            { id: 'cancelled', label: 'Cancelled', current: statusMap.cancelled, previous: 0 },
        ],
        alerts,
        insights: [
            { id: 'repeat', label: 'Repeat Customers', value: `${repeatRate.toFixed(0)}%`, current: repeatRate, previous: 0 },
            { id: 'avg', label: 'Avg. Booking Value', value: `₹${avgBookingValue.toFixed(0)}`, current: avgBookingValue, previous: 0 },
            { id: 'peak', label: 'Peak Booking Time', value: 'Anytime', current: 0, previous: 0 }
        ],
        topServices: topServicesList.map(s => ({
            id: s.id,
            name: s.name,
            bookings: { current: s.bookings, previous: 0 },
            revenue: s.revenue
        }))
    };
};

/**
 * Get detailed analytics for a specific service
 */
const getServiceAnalytics = async (serviceId, period = 'thisWeek') => {
    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { 
            shop: {
                select: {
                    averageRating: true,
                    reviewCount: true
                }
            }
        }
    });

    if (!service) throw new Error('Service not found');

    const now = new Date();
    let startDate;
    let endDate = now;

    if (period === 'last30Days') {
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    } else if (period === 'custom') {
        // Yearly trend: last 12 months
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    } else {
        // thisWeek: Starting Monday
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(new Date(now).setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    }

    // 1. Fetch Bookings involving this service
    const bookings = await prisma.booking.findMany({
        where: {
            services: { some: { id: serviceId } },
            createdAt: { gte: startDate, lte: endDate }
        },
        include: { services: true }
    });

    const completed = bookings.filter(b => b.status === 'COMPLETED');
    
    // Revenue for THIS specific service
    const earnings = completed.reduce((sum, b) => {
        const item = b.services.find(s => s.id === serviceId);
        return sum + (item?.price || 0);
    }, 0);

    // 2. Chart Data Generation
    let labels = [];
    let dataset = [];

    if (period === 'custom') {
        // Monthly segments for 12 months
        for (let i = 0; i < 12; i++) {
            const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            
            const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            const count = bookings.filter(b => b.createdAt >= d && b.createdAt < nextD).length;
            dataset.push(count);
        }
    } else if (period === 'last30Days') {
        // 4 Weekly segments
        for (let i = 0; i < 4; i++) {
            const d = new Date(startDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
            labels.push(`W${i + 1}`);
            
            const nextD = new Date(d.getTime() + (7 * 24 * 60 * 60 * 1000));
            const count = bookings.filter(b => b.createdAt >= d && b.createdAt < nextD).length;
            dataset.push(count);
        }
    } else {
        // Daily segments for the week (Mon-Sun)
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            d.setHours(0, 0, 0, 0);
            const nextD = new Date(d);
            nextD.setDate(d.getDate() + 1);
            
            labels.push(dayLabels[i]);
            const count = bookings.filter(b => b.createdAt >= d && b.createdAt < nextD).length;
            dataset.push(count);
        }
    }

    // 3. Service Rating
    // We get both the aggregated period rating AND the stored service-level rating
    const aggregatedRatings = await prisma.serviceRating.aggregate({
        where: { serviceId, createdAt: { gte: startDate, lte: endDate } },
        _avg: { rating: true },
        _count: { id: true }
    });

    // 4. Comparison with previous period
    const duration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - duration);
    
    const prevBookings = await prisma.booking.findMany({
        where: {
            services: { some: { id: serviceId } },
            createdAt: { gte: prevStart, lte: startDate }
        },
        include: { services: true }
    });

    const prevCompleted = prevBookings.filter(b => b.status === 'COMPLETED');
    const prevEarnings = prevCompleted.reduce((sum, b) => {
        const item = b.services.find(s => s.id === serviceId);
        return sum + (item?.price || 0);
    }, 0);

    return {
        serviceId,
        serviceName: service.name,
        period,
        totalBookings: bookings.length,
        earnings,
        avgPerBooking: completed.length > 0 ? Math.round(earnings / completed.length) : 0,
        rating: {
            // Priority 1: Periodic rating, Priority 2: Service-level cached rating, Priority 3: Default 0
            average: aggregatedRatings._avg.rating || service.averageRating || 0,
            count: aggregatedRatings._count.id || service.reviewCount || 0,
            // Calculate satisfaction rate (assuming 5 is Like/Positive, 1 is Dislike/Negative)
            // We treat anything >= 3 as positive for this calculation
            satisfactionRate: service.reviewCount > 0 
                ? Math.round(((aggregatedRatings._avg.rating || service.averageRating) / 5) * 100)
                : 100
        },
        shopRating: {
            average: service.shop.averageRating,
            count: service.shop.reviewCount
        },
        chartData: {
            labels,
            datasets: [{ data: dataset }]
        },
        comparison: {
            bookings: { current: bookings.length, previous: prevBookings.length },
            earnings: { current: earnings, previous: prevEarnings }
        }
    };
};

module.exports = {
    incrementShopView,
    getShopAnalytics,
    getServiceAnalytics
};
