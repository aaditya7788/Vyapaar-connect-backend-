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
                    { OR: [
                        { endDate: null },
                        { endDate: { gte: new Date() } }
                    ]}
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
                    some: { isFeatured: true }
                }
            },
            include: {
                community: true,
                services: {
                    where: { isFeatured: true },
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
                status: 'VERIFIED'
            },
            include: {
                community: true,
                services: {
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
const searchDiscovery = async (filters) => {
    const { q, category, community } = filters;

    const where = {
        status: 'VERIFIED',
    };

    if (category) {
        where.category = category;
    }

    if (community) {
        where.community = {
            slug: community.toLowerCase()
        };
    }

    if (q) {
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { businessSummary: { contains: q, mode: 'insensitive' } },
            { tags: { has: q.toLowerCase() } }, 
            { category: { contains: q, mode: 'insensitive' } },
            { subcategories: { has: q } }, // Match within array
            { services: { 
                some: { 
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { description: { contains: q, mode: 'insensitive' } },
                        { subcategories: { has: q } }
                    ]
                }
            } }
        ];
    }

    const shops = await prisma.shop.findMany({
        where,
        include: {
            community: true,
            services: {
                where: { isActive: true }
            }
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });

    return shops;
};

module.exports = {
    getHomeFeed,
    searchDiscovery
};
