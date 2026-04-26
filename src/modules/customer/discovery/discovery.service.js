const prisma = require('../../../db');

/**
 * Get Home Feed Data
 * Returns Banners, Categories, and Trending/Top Rated Shops
 */
const getHomeFeed = async () => {
    // 1. Execute all independent queries in parallel
    const [activeAds, categories, featuredShops, trendingShops] = await Promise.all([
        // 1. Fetch Dynamic Advertisements
        prisma.advertisement.findMany({
            where: {
                isActive: true,
                OR: [
                    { startDate: null },
                    { startDate: { lte: new Date() } }
                ],
                AND: [
                    {
                        OR: [
                            { endDate: null },
                            { endDate: { gte: new Date() } }
                        ]
                    }
                ]
            },
            orderBy: { order: 'asc' }
        }),

        // 2. Fetch Visible Categories
        prisma.category.findMany({
            where: { isVisible: true },
            include: {
                subcategories: {
                    where: { isVisible: true },
                    orderBy: { order: 'asc' },
                    take: 4
                }
            },
            orderBy: { order: 'asc' },
            take: 12
        }),

        // 3. Fetch Featured Shops
        prisma.shop.findMany({
            where: {
                status: 'VERIFIED',
                services: {
                    some: {
                        isFeatured: true,
                        isActive: true
                    }
                }
            },
            include: {
                community: true,
                services: {
                    where: {
                        isFeatured: true,
                        isActive: true
                    },
                    take: 1
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 10
        }),

        // 4. Fetch Trending Shops (Recently verified)
        prisma.shop.findMany({
            where: {
                status: 'VERIFIED',
                services: {
                    some: { isActive: true }
                }
            },
            include: {
                community: true,
                services: {
                    where: { isActive: true },
                    take: 2
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 10
        })
    ]);

    return {
        banners: activeAds,
        categories,
        trendingShops,
        featuredShops
    };
};

/**
 * Search Shops & Services
 * Filters by query, category name, and community slug
 */
const searchDiscovery = async (filters, userId = null) => {
    const { q, category, community, page = 1, limit = 10, sortBy, lat, lng } = filters;
    
    // Log search query for analytics
    if (q) {
        logSearch(q, userId, filters.communityId || null).catch(err => console.error('Logging failed:', err));
    }

    const skip = (page - 1) * limit;
    const take = parseInt(limit);

    const whereShop = { status: 'VERIFIED' };
    const whereService = { isActive: true, shop: { status: 'VERIFIED' } };

    if (category) {
        whereShop.category = category;
        whereService.category = category;
    }

    if (community) {
        whereShop.community = { slug: community.toLowerCase() };
        whereService.shop = { ...whereService.shop, community: { slug: community.toLowerCase() } };
    }

    const orderBy = {};
    if (sortBy === 'rating') {
        orderBy.averageRating = 'desc';
    } else {
        orderBy.updatedAt = 'desc';
    }

    if (q) {
        const qL = q.toLowerCase();
        whereShop.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { businessSummary: { contains: q, mode: 'insensitive' } },
            { tags: { has: qL } },
            { category: { contains: q, mode: 'insensitive' } },
            { subcategories: { has: q } },
            { providerProfile: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
            {
                services: {
                    some: {
                        OR: [
                            { name: { contains: q, mode: 'insensitive' } },
                            { description: { contains: q, mode: 'insensitive' } }
                        ]
                    }
                }
            }
        ];

        whereService.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { subcategories: { has: q } }
        ];
    }

    // Memory efficiency: cap the initial query fetch (LOW RAM optimization).
    const CAP = 30;
    const [rawShops, rawServices] = await Promise.all([
        prisma.shop.findMany({
            where: whereShop,
            include: { community: true, services: { where: { isActive: true }, take: 2 } },
            take: CAP,
            orderBy: orderBy
        }),
        prisma.service.findMany({
            where: whereService,
            include: { shop: { include: { community: true } } },
            take: CAP,
            orderBy: orderBy
        })
    ]);

    let mixed = [
        ...rawShops.map(s => ({ type: 'SHOP', ...s })),
        ...rawServices.map(s => ({ type: 'SERVICE', ...s }))
    ];

    if (lat && lng) {
        const latFloat = parseFloat(lat);
        const lngFloat = parseFloat(lng);
        mixed = mixed.map(item => {
            const latitude = item.type === 'SHOP' ? item.latitude : item.shop?.latitude;
            const longitude = item.type === 'SHOP' ? item.longitude : item.shop?.longitude;
            let distance = null;
            if (latitude && longitude) {
                const R = 6371;
                const dLat = (latitude - latFloat) * Math.PI / 180;
                const dLon = (longitude - lngFloat) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(latFloat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                distance = R * c;
            }
            return { ...item, distance };
        });
    }

    if (sortBy === 'rating') {
        mixed.sort((a, b) => {
            const rA = a.type === 'SHOP' ? (a.averageRating || 0) : (a.shop?.averageRating || 0);
            const rB = b.type === 'SHOP' ? (b.averageRating || 0) : (b.shop?.averageRating || 0);
            return rB - rA;
        });
    } else if (sortBy === 'distance' && lat && lng) {
        mixed.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
    } else {
        mixed.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    const total = mixed.length;
    const shops = mixed.slice(skip, skip + take);

    return {
        shops,
        meta: {
            total,
            page: parseInt(page),
            limit: take,
            totalPages: Math.ceil(total / take)
        }
    };
};

/**
 * Get NearBy Home Services Grouped by Category
 */
const getHomeServices = async (lat, lng, radiusKm = 10) => {
    // 1. Fetch effective radius and strictness flag from GlobalSettings
    const settings = await prisma.globalSettings.findMany({
        where: { key: { in: ['RADIUS_FILTER_KM', 'STRICT_KM_FILTER', 'NEARBY_RADIUS_KM'] } }
    });

    let effectiveRadius = radiusKm;
    let isStrict = true; // Default to strict so users aren't confused by far away shops.

    settings.forEach(s => {
        if (s.key === 'RADIUS_FILTER_KM' || s.key === 'NEARBY_RADIUS_KM') effectiveRadius = parseFloat(s.value);
        if (s.key === 'STRICT_KM_FILTER') isStrict = s.value === 'true';
    });

    // 2. Fetch all visible categories
    const categories = await prisma.category.findMany({
        where: { isVisible: true },
        orderBy: { order: 'asc' },
        include: {
            subcategories: {
                where: { isVisible: true }
            }
        }
    });

    let shops = [];
    if (lat && lng) {
        const latFloat = parseFloat(lat);
        const lngFloat = parseFloat(lng);
        if (isStrict) {
            // HA strict enforcement - hide everything beyond the radius
            shops = await prisma.$queryRaw`
                SELECT * FROM (
                    SELECT id, name, "profileImage", latitude, longitude,
                    (6371 * acos(cos(radians(${latFloat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lngFloat})) + sin(radians(${latFloat})) * sin(radians(latitude)))) AS distance
                    FROM "Shop"
                    WHERE status = 'VERIFIED' AND latitude IS NOT NULL AND longitude IS NOT NULL
                ) AS nearby_shops
                WHERE distance <= ${effectiveRadius}
                ORDER BY distance ASC 
            `;
        } else {
            // HA relaxed enforcement - "turn off it will more than that too"
            // Shows nearby things first, but doesn't cut off at the radius limit. Cap at 50 to prevent memory blowouts.
            shops = await prisma.$queryRaw`
                SELECT id, name, "profileImage", latitude, longitude,
                (6371 * acos(cos(radians(${latFloat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lngFloat})) + sin(radians(${latFloat})) * sin(radians(latitude)))) AS distance
                FROM "Shop"
                WHERE status = 'VERIFIED' AND latitude IS NOT NULL AND longitude IS NOT NULL
                LIMIT 50
            `;
        }
    } else {
        shops = await prisma.shop.findMany({
            where: { status: 'VERIFIED' },
            select: { id: true, name: true, profileImage: true, latitude: true, longitude: true }
        });
        shops = shops.map(s => ({ ...s, distance: null }))
    }

    const shopIds = shops.map(s => s.id);

    // 3. Fetch active services for these nearby shops
    let services = [];
    if (shopIds.length > 0) {
        services = await prisma.service.findMany({
            where: {
                shopId: { in: shopIds },
                isActive: true
            },
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        profileImage: true,
                        averageRating: true,
                        reviewCount: true,
                        community: true
                    }
                }
            }
        });
    }

    // 4. Group by category
    const sections = categories.map(cat => {
        const subcatNames = cat.subcategories.map(s => s.name);

        const catServices = services.filter(srv =>
            srv.category === cat.name ||
            (srv.subcategories && srv.subcategories.some(sub => subcatNames.includes(sub)))
        ).map(srv => {
            const shopMatch = shops.find(s => s.id === srv.shopId);
            return {
                ...srv,
                distance: shopMatch ? shopMatch.distance : null,
                supportsQuantity: cat.supportsQuantity || false
            };
        });

        return {
            categoryId: cat.id,
            categoryName: cat.name,
            categoryIcon: cat.icon,
            isTrending: cat.isTrending || false,
            services: catServices.slice(0, 12),
            totalCount: catServices.length
        };
    }).filter(section => section.totalCount > 0);

    return {
        sections,
        radiusKm: effectiveRadius
    };
};

/**
 * Log Search Query for Analytics
 */
const logSearch = async (query, userId = null, communityId = null) => {
    try {
        if (!query || query.trim().length === 0) return;
        
        await prisma.searchLog.create({
            data: {
                query: query.trim().toLowerCase(),
                userId,
                communityId
            }
        });
    } catch (error) {
        // Silently fail as logging shouldn't break search
        console.error('[SEARCH LOG ERROR]:', error);
    }
};

/**
 * Get Trending Keywords (Admin Pinned + High Volume Logs)
 */
const getTrendingKeywords = async (limit = 10) => {
    // 1. Get pinned keywords
    const pinned = await prisma.searchKeyword.findMany({
        where: { isPinned: true },
        orderBy: { order: 'asc' },
        take: limit
    });

    // 2. If we need more, get from logs (last 30 days)
    if (pinned.length < limit) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const logs = await prisma.searchLog.groupBy({
            by: ['query'],
            _count: { query: true },
            where: {
                createdAt: { gte: thirtyDaysAgo }
            },
            orderBy: {
                _count: { query: 'desc' }
            },
            take: limit - pinned.length
        });

        const logKeywords = logs.map(l => ({
            keyword: l.query,
            isPinned: false
        }));

        return [...pinned, ...logKeywords];
    }

    return pinned;
};

/**
 * Get Detailed Search Analytics for Admin
 */
const getSearchInsights = async (days = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 1. Get Top Logs
    const topLogs = await prisma.searchLog.groupBy({
        by: ['query'],
        _count: { query: true },
        where: {
            createdAt: { gte: startDate }
        },
        orderBy: {
            _count: { query: 'desc' }
        },
        take: 20
    });

    // 2. Get currently pinned keywords for comparison
    const pinned = await prisma.searchKeyword.findMany();
    const pinnedSet = new Set(pinned.map(p => p.keyword.toLowerCase()));

    // 3. Merge data
    const insights = topLogs.map(log => ({
        keyword: log.query,
        count: log._count.query,
        isPinned: pinnedSet.has(log.query.toLowerCase()),
        isPopular: log._count.query >= 5 // Threshold for 'Popular' label in dashboard
    }));

    return insights;
};

module.exports = {
    getHomeFeed,
    searchDiscovery,
    getHomeServices,
    logSearch,
    getTrendingKeywords,
    getSearchInsights
};
