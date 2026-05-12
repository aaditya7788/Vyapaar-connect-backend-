const prisma = require('../../../db');
const slotService = require('../../provider/slots/slot.service');

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
                isFrozen: false,
                providerProfile: {
                    isActive: true,
                    user: { status: 'active' }
                },
                services: {
                    some: {
                        isFeatured: true,
                        isActive: true,
                        stock: { not: 0 }
                    }
                }
            },
            include: {
                community: true,
                services: {
                    where: {
                        isFeatured: true,
                        isActive: true,
                        stock: { not: 0 }
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
                isFrozen: false,
                providerProfile: {
                    isActive: true,
                    user: { status: 'active' }
                },
                services: {
                    some: { 
                        isActive: true,
                        stock: { not: 0 }
                    }
                }
            },
            include: {
                community: true,
                services: {
                    where: { 
                        isActive: true,
                        stock: { not: 0 }
                    },
                    take: 2
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 10
        })
    ]);

    // 2. Surgical Category Enrichment (Home Feed)
    const allServices = [
        ...featuredShops.flatMap(s => s.services || []),
        ...trendingShops.flatMap(s => s.services || [])
    ];
    const categoryNames = [...new Set(allServices.map(s => s.category).filter(Boolean))];
    const catSettings = await prisma.category.findMany({
        where: { name: { in: categoryNames } }
    });

    const enrichService = (srv) => {
        const setting = catSettings.find(c => c.name === srv.category);
        return {
            ...srv,
            supportsQuantity: setting?.supportsQuantity || false,
            categorySettings: setting ? {
                supportsQuantity: setting.supportsQuantity,
                supportsInclusions: setting.supportsInclusions,
                isAppointmentBased: setting.isAppointmentBased
            } : null
        };
    };

    featuredShops.forEach(shop => {
        if (shop.services) shop.services = shop.services.map(enrichService);
    });
    trendingShops.forEach(shop => {
        if (shop.services) shop.services = shop.services.map(enrichService);
    });

    return {
        banners: activeAds,
        categories,
        featuredShops,
        trendingShops
    };
};

/**
 * Search Shops & Services
 * Filters by query, category name, and community slug
 */
const searchDiscovery = async (filters, userId = null) => {
    const { q, category, community, page = 1, limit = 10, sortBy, lat, lng, date } = filters;

    // Log search query for analytics
    if (q) {
        logSearch(q, userId, filters.communityId || null).catch(err => console.error('Logging failed:', err));
    }

    const skip = (page - 1) * limit;
    const take = parseInt(limit);

    // ── Batch Fetch Global Settings (Optimization) ──
    const globalSettings = await prisma.globalSettings.findMany({
        where: { key: { in: ['RADIUS_FILTER_KM', 'STRICT_KM_FILTER', 'booking_request_fee'] } }
    });

    const radius = parseFloat(globalSettings.find(s => s.key === 'RADIUS_FILTER_KM')?.value || '15');
    const isStrict = globalSettings.find(s => s.key === 'STRICT_KM_FILTER')?.value === 'true';
    const requestFee = parseInt(globalSettings.find(s => s.key === 'booking_request_fee')?.value || '0');

    const whereShop = { 
        status: 'VERIFIED',
        isFrozen: false,
        providerProfile: {
            isActive: true,
            user: { status: 'active' }
        }
    };
    const whereService = { 
        isActive: true,
        stock: { not: 0 }, // Filter out sold out items
        shop: { 
            status: 'VERIFIED',
            isFrozen: false,
            providerProfile: {
                isActive: true,
                user: { status: 'active' }
            }
        } 
    };

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
    const CAP = 20; // Reduced for performance
    
    // Dynamic include based on fee (Skip joins if fee is 0)
    const providerInclude = requestFee > 0 ? {
        providerProfile: {
            include: {
                user: {
                    include: { credits: { select: { balance: true } } }
                }
            }
        }
    } : {};

    const [rawShops, rawServices] = await Promise.all([
        prisma.shop.findMany({
            where: whereShop,
            include: {
                community: true,
                services: { 
                    where: { 
                        isActive: true,
                        stock: { not: 0 }
                    }, 
                    take: 2,
                    include: { 
                        configurableInclusions: true
                    }
                },
                ...providerInclude
            },
            take: CAP,
            orderBy: orderBy
        }),
        prisma.service.findMany({
            where: whereService,
            include: {
                shop: {
                    include: { 
                        community: true,
                        ...providerInclude
                    }
                }
            },
            take: CAP,
            orderBy: orderBy
        })
    ]);

    let mixed = [
        ...rawShops.map(s => ({ type: 'SHOP', ...s })),
        ...rawServices.map(s => ({ type: 'SERVICE', ...s }))
    ];

    // Surgical Fetch: Get category settings for these results
    const categoryNames = [...new Set(mixed.map(m => m.category).filter(Boolean))];
    const catSettings = await prisma.category.findMany({
        where: { name: { in: categoryNames } },
        select: { name: true, supportsInclusions: true, supportsQuantity: true, isAppointmentBased: true }
    });

    mixed = mixed.map(item => {
        const setting = catSettings.find(c => c.name === item.category);
        const isModular = setting?.supportsInclusions || false;
        const canSupportQty = setting?.supportsQuantity || false;
        const isAppointment = setting?.isAppointmentBased || false;

        // If it's a shop, also tag its nested services
        if (item.type === 'SHOP' && item.services) {
            item.services = item.services.map(srv => {
                const srvSetting = catSettings.find(c => c.name === (srv.category || item.category));
                return {
                    ...srv,
                    is_inclusion: srvSetting?.supportsInclusions || false,
                    supportsQuantity: srvSetting?.supportsQuantity || false,
                    categorySettings: srvSetting ? {
                        supportsQuantity: srvSetting.supportsQuantity,
                        supportsInclusions: srvSetting.supportsInclusions,
                        isAppointmentBased: srvSetting.isAppointmentBased
                    } : null
                };
            });
        }

        return {
            ...item,
            is_inclusion: isModular,
            supportsQuantity: canSupportQty,
            categorySettings: setting ? {
                supportsQuantity: setting.supportsQuantity,
                supportsInclusions: setting.supportsInclusions,
                isAppointmentBased: setting.isAppointmentBased
            } : null
        };
    });

    // --- Availability Filtering ---
    if (date && date !== 'OPEN_PICKER') {
        const availabilityCache = new Map();
        const dayOfWeek = new Date(date).getUTCDay();
        const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const currentDayStr = daysMap[dayOfWeek];

        const checkAvailability = async (item) => {
            const shop = item.type === 'SHOP' ? item : (item.shop);
            const shopId = shop?.id;
            if (!shopId) return true;

            // 1. Fast Path: Check working days (pre-fetched)
            if (shop.workingDays && !shop.workingDays.includes(currentDayStr)) {
                return false;
            }

            // 2. Use cache to avoid redundant hits
            if (availabilityCache.has(shopId)) return availabilityCache.get(shopId);

            try {
                const availability = await slotService.getAvailableSlots(shopId, date);
                const isAvailable =
                    !availability.isClosed &&
                    !availability.isHoliday &&
                    availability.slots.length > 0 &&
                    availability.slots.some(s => s.status === 'available');

                availabilityCache.set(shopId, isAvailable);
                return isAvailable;
            } catch (error) {
                console.error(`[Search Availability Error] Shop ${shopId}:`, error);
                return true;
            }
        };

        // 3. Batched Parallel Execution to prevent DB saturation (Max 10 at a time)
        const batchSize = 10;
        const results = [];
        for (let i = 0; i < mixed.length; i += batchSize) {
            const batch = mixed.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(item => checkAvailability(item)));
            results.push(...batchResults);
        }
        mixed = mixed.filter((_, index) => results[index]);
    }

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

        // ── Strict Enforcement ──
        if (isStrict) {
            const originalCount = mixed.length;
            mixed = mixed.filter(item => item.distance === null || item.distance <= radius);
            console.log(`🛡️ [Search Strict] Filtered out ${originalCount - mixed.length} results beyond ${radius}km`);
        }
    }

    // Fetch penalty factor from settings (Dynamic - No hardcode)
    const penaltySetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_PENALTY_FACTOR' } });
    const penaltyFactor = penaltySetting ? parseFloat(penaltySetting.value) : 0.1;

    const distancePenaltySetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_DISTANCE_PENALTY' } });
    const distancePenaltyFactor = distancePenaltySetting ? parseFloat(distancePenaltySetting.value) : 10; // Default 10km per point (more aggressive)

    if (sortBy === 'rating') {
        mixed.sort((a, b) => {
            const rA = a.type === 'SHOP' ? (a.averageRating || 0) : (a.shop?.averageRating || 0);
            const rB = b.type === 'SHOP' ? (b.averageRating || 0) : (b.shop?.averageRating || 0);

            // Apply remark penalty from the Shop object
            const remA = a.type === 'SHOP' ? (a.remarkScore || 0) : (a.shop?.remarkScore || 0);
            const remB = b.type === 'SHOP' ? (b.remarkScore || 0) : (b.shop?.remarkScore || 0);

            const scoreA = parseFloat(rA) - (parseInt(remA) * penaltyFactor);
            const scoreB = parseFloat(rB) - (parseInt(remB) * penaltyFactor);

            return scoreB - scoreA;
        });
    } else if (sortBy === 'distance' && lat && lng) {
        mixed.sort((a, b) => {
            const remA = a.type === 'SHOP' ? (a.remarkScore || 0) : (a.shop?.remarkScore || 0);
            const remB = b.type === 'SHOP' ? (b.remarkScore || 0) : (b.shop?.remarkScore || 0);

            const distA = (a.distance || 9999) + (remA * distancePenaltyFactor);
            const distB = (b.distance || 9999) + (remB * distancePenaltyFactor);

            return distA - distB;
        });
    } else {
        // Default: Sort by Recency but sink those with high penalties
        mixed.sort((a, b) => {
            const timeA = new Date(a.updatedAt).getTime();
            const timeB = new Date(b.updatedAt).getTime();

            const remA = a.type === 'SHOP' ? (a.remarkScore || 0) : (a.shop?.remarkScore || 0);
            const remB = b.type === 'SHOP' ? (b.remarkScore || 0) : (b.shop?.remarkScore || 0);

            // Every penalty point "ages" the provider by 1 day in recency sort
            const penaltyMs = 24 * 60 * 60 * 1000;
            return (timeB - (remB * penaltyMs)) - (timeA - (remA * penaltyMs));
        });
    }

    // --- Credit Balance Filtering (Phase 2.1 Stabilization) ---
    if (requestFee > 0) {
        const originalCount = mixed.length;
        mixed = mixed.filter(item => {
            const balance = item.type === 'SHOP' 
                ? item.providerProfile?.user?.credits?.balance 
                : item.shop?.providerProfile?.user?.credits?.balance;
            
            // If balance is missing (not initialized), assume 0
            return (balance || 0) >= requestFee;
        });
        if (originalCount !== mixed.length) {
            console.log(`💰 [Search Credit Check] Filtered out ${originalCount - mixed.length} providers with insufficient balance (< ${requestFee})`);
        }
    }

    const total = mixed.length;
    const shops = mixed.slice(skip, skip + take);

    const visibleThresholdSetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_VISIBLE_THRESHOLD' } });
    const visibleThreshold = visibleThresholdSetting ? parseInt(visibleThresholdSetting.value) : 3;

    const categoriesSetting = await prisma.globalSettings.findUnique({ where: { key: 'REMARK_CATEGORIES_JSON' } });
    const reportCategories = categoriesSetting ? JSON.parse(categoriesSetting.value) : [
        { id: 'RUDE', label: 'Inappropriate Behavior', icon: 'UserX', color: '#FF5722', weight: 1 },
        { id: 'DELAYED', label: 'Severe Delay / No Show', icon: 'Clock', color: '#FFC107', weight: 2 },
        { id: 'UNPROFESSIONAL', label: 'Unprofessional Conduct', icon: 'AlertCircle', color: '#03A9F4', weight: 2 },
        { id: 'FRAUD', label: 'Payment Fraud / Overcharging', icon: 'ShieldAlert', color: '#E91E63', weight: 4 },
        { id: 'SAFETY', label: 'Safety / Security Concern', icon: 'ShieldAlert', color: '#F44336', weight: 5 }
    ];

    return {
        status: 'success',
        shops,
        meta: {
            total,
            page: parseInt(page),
            limit: take,
            totalPages: Math.ceil(total / take),
            visibleThreshold,
            reportCategories
        }
    };
};


/**
 * Get NearBy Home Services Grouped by Category
 */
const getHomeServices = async (lat, lng, radiusKm = 10) => {
    // 1. Fetch effective radius and strictness flag from GlobalSettings
    const globalSettings = await prisma.globalSettings.findMany({
        where: { key: { in: ['RADIUS_FILTER_KM', 'STRICT_KM_FILTER', 'NEARBY_RADIUS_KM', 'booking_request_fee', 'REMARK_DISTANCE_PENALTY', 'REMARK_PENALTY_FACTOR'] } }
    });

    const radiusFromDb = parseFloat(globalSettings.find(s => s.key === 'RADIUS_FILTER_KM' || s.key === 'NEARBY_RADIUS_KM')?.value || '15');
    const isStrict = globalSettings.find(s => s.key === 'STRICT_KM_FILTER')?.value === 'true';
    const effectiveRadius = radiusKm ? parseFloat(radiusKm) : radiusFromDb;
    const requestFee = parseInt(globalSettings.find(s => s.key === 'booking_request_fee')?.value || '0');
    const distPenalty = parseFloat(globalSettings.find(s => s.key === 'REMARK_DISTANCE_PENALTY')?.value || '5');
    const penaltyFactor = parseFloat(globalSettings.find(s => s.key === 'REMARK_PENALTY_FACTOR')?.value || '0.1');

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

        console.log('🔍 [HomeServices] Search params:', { lat, lng, radius: radiusFromDb, isStrict, effectiveRadius, distPenalty });

        if (isStrict) {
            // HA strict enforcement - hide everything beyond the radius
            shops = await prisma.$queryRaw`
                SELECT * FROM (
                    SELECT s.id, s.name, s."profileImage", s.latitude, s.longitude, s."remarkScore", s.category, s.gallery, s."backgroundImages",
                    (6371 * acos(cos(radians(${latFloat})) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians(${lngFloat})) + sin(radians(${latFloat})) * sin(radians(s.latitude)))) AS distance,
                    COALESCE(uc.balance, 0) as "creditBalance"
                    FROM "Shop" s
                    JOIN "ProviderProfile" pp ON s."providerProfileId" = pp.id
                    LEFT JOIN "UserCredits" uc ON pp."userId" = uc."userId"
                    WHERE s.status = 'VERIFIED' AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
                ) AS nearby_shops
                WHERE distance <= ${effectiveRadius}
                ORDER BY (distance + (COALESCE("remarkScore", 0) * ${distPenalty})) ASC
            `;
        } else {
            // HA relaxed enforcement
            shops = await prisma.$queryRaw`
                SELECT * FROM (
                    SELECT s.id, s.name, s."profileImage", s.latitude, s.longitude, s."remarkScore", s.category, s.gallery, s."backgroundImages",
                    (6371 * acos(cos(radians(${latFloat})) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians(${lngFloat})) + sin(radians(${latFloat})) * sin(radians(s.latitude)))) AS distance,
                    COALESCE(uc.balance, 0) as "creditBalance"
                    FROM "Shop" s
                    JOIN "ProviderProfile" pp ON s."providerProfileId" = pp.id
                    LEFT JOIN "UserCredits" uc ON pp."userId" = uc."userId"
                    WHERE s.status = 'VERIFIED' AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
                ) AS nearby_shops
                ORDER BY (distance + (COALESCE("remarkScore", 0) * ${distPenalty})) ASC
                LIMIT 50
            `;
        }

        console.log(`✅ [HomeServices] Found ${shops?.length || 0} shops nearby.`);

    } else {
        shops = await prisma.shop.findMany({
            where: { status: 'VERIFIED' },
            select: { id: true, name: true, profileImage: true, latitude: true, longitude: true, remarkScore: true }
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
                isActive: true,
                stock: { not: 0 }
            },
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        profileImage: true,
                        averageRating: true,
                        reviewCount: true,
                        remarkScore: true,
                        community: true
                    }
                }
            }
        });
    }
    console.log(`[DISCOVERY DEBUG]: Found ${services.length} active services for these shops.`);

    // 4. Group by category
    const sections = categories.map(cat => {
        const subcatNames = cat.subcategories.map(s => s.name);

        const catServices = services.filter(srv =>
            srv.category === cat.name ||
            (srv.subcategories && srv.subcategories.some(sub => subcatNames.includes(sub)))
        ).map(srv => {
            const shopMatch = shops.find(s => s.id === srv.shopId);
            const score = parseFloat(srv.shop?.averageRating || 0) - (parseInt(srv.shop?.remarkScore || 0) * penaltyFactor);
            
            // Credit check for Home Services (Optimization: use pre-fetched requestFee)
            const hasCredits = (shopMatch?.creditBalance || 0) >= requestFee;

            return {
                ...srv,
                distance: shopMatch ? shopMatch.distance : null,
                supportsQuantity: cat.supportsQuantity || false,
                sortScore: score,
                isAvailableByCredits: hasCredits,
                categorySettings: {
                    isAppointmentBased: cat.isAppointmentBased || false,
                    supportsDailyMenu: cat.supportsDailyMenu || false,
                    supportsInclusions: cat.supportsInclusions || false,
                    supportsQuantity: cat.supportsQuantity || false
                }
            };
        }).filter(srv => {
            if (requestFee <= 0) return true; // Skip check if fee is 0
            return srv.isAvailableByCredits;
        })
        .sort((a, b) => b.sortScore - a.sortScore);

        return {
            categoryId: cat.id,
            categoryName: cat.name,
            categoryIcon: cat.icon,
            isTrending: cat.isTrending || false,
            supportsDailyMenu: cat.supportsDailyMenu || false,
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

const getServiceInclusions = async (serviceId) => {
    return prisma.serviceInclusion.findMany({
        where: { serviceId },
        orderBy: { name: 'asc' }
    });
};

module.exports = {
    getHomeFeed,
    searchDiscovery,
    getHomeServices,
    logSearch,
    getTrendingKeywords,
    getSearchInsights,
    getServiceInclusions
};
