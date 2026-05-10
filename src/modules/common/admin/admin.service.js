const prisma = require('../../../db');
const { deleteFile } = require('../../../utils/file.utils');
const { sendNotificationToUser } = require('../../../utils/notification');
const mail = require('../../../utils/mail');

/**
 * Categories - Admin List
 */
const listCategoriesIncludingHidden = async () => {
    return await prisma.category.findMany({
        orderBy: { order: 'asc' },
        include: { subcategories: { orderBy: { order: 'asc' } } }
    });
};

/**
 * Reorder Categories (Batch)
 */
const reorderCategories = async (orderings) => {
    const transactions = orderings.map(o =>
        prisma.category.update({
            where: { id: o.id },
            data: { order: o.order }
        })
    );
    return await prisma.$transaction(transactions);
};

/**
 * Toggle Visibility
 */
const updateVisibility = async (id, isVisible) => {
    return await prisma.category.update({
        where: { id },
        data: { isVisible }
    });
};

/**
 * Toggle Trending status
 */
const updateTrending = async (type, id, isTrending) => {
    if (type === 'category') {
        return await prisma.category.update({
            where: { id },
            data: { isTrending }
        });
    } else {
        return await prisma.subcategory.update({
            where: { id },
            data: { isTrending }
        });
    }
};

/**
 * Toggle Subcategory Visibility
 */
const updateSubcategoryVisibility = async (id, isVisible) => {
    return await prisma.subcategory.update({
        where: { id },
        data: { isVisible }
    });
};

/**
 * Advertisements - Admin Operations
 */
const getAllAds = async () => {
    return await prisma.advertisement.findMany({
        orderBy: { order: 'asc' }
    });
};

const createAdvertisement = async (adData) => {
    const { id, createdAt, updatedAt, ...validData } = adData;
    return await prisma.advertisement.create({
        data: {
            ...validData,
            startDate: validData.startDate ? new Date(validData.startDate) : null,
            endDate: validData.endDate ? new Date(validData.endDate) : null,
            order: validData.order || 0
        }
    });
};

const updateAdvertisement = async (id, adData) => {
    const oldAd = await prisma.advertisement.findUnique({ where: { id } });
    if (adData.image && oldAd.image && adData.image !== oldAd.image) {
        deleteFile(oldAd.image);
    }

    const { id: _, createdAt, updatedAt, ...validData } = adData;
    return await prisma.advertisement.update({
        where: { id },
        data: {
            ...validData,
            startDate: validData.startDate ? new Date(validData.startDate) : undefined,
            endDate: validData.endDate ? new Date(validData.endDate) : undefined
        }
    });
};

const removeAd = async (id) => {
    const ad = await prisma.advertisement.findUnique({ where: { id } });
    if (ad?.image) {
        deleteFile(ad.image);
    }
    return await prisma.advertisement.delete({
        where: { id }
    });
};

/**
 * Shops List for linking
 */
const listShops = async () => {
    return await prisma.shop.findMany({
        select: { id: true, name: true, businessSummary: true }
    });
};

/**
 * Full Admin Shops List (with freeze status + provider info)
 */
const listShopsForAdmin = async (params = {}) => {
    const { search } = params;
    const where = search ? {
        OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } }
        ]
    } : {};
    return await prisma.shop.findMany({
        where,
        select: {
            id: true,
            name: true,
            category: true,
            status: true,
            isFrozen: true,
            providerProfile: {
                select: {
                    id: true,
                    isActive: true,
                    user: { select: { id: true, fullName: true, phone: true } }
                }
            }
        },
        orderBy: [{ isFrozen: 'desc' }, { updatedAt: 'desc' }],
        take: 200
    });
};

/**
 * Services List for linking
 */
const listServices = async () => {
    return await prisma.service.findMany({
        select: { id: true, name: true, category: true, subcategories: true, shopId: true }
    });
};

/**
 * Freeze or unfreeze a specific shop
 * Sends real-time FCM notification to the provider
 */
const setShopFreezeStatus = async (id, isFrozen) => {
    const shop = await prisma.shop.update({
        where: { id },
        data: { isFrozen },
        include: {
            providerProfile: {
                include: { user: true }
            }
        }
    });

    // 🔥 Real-time FCM push to the provider
    const providerId = shop.providerProfile?.user?.id;
    if (providerId) {
        await sendNotificationToUser(providerId, {
            title: isFrozen ? '🔒 Shop Frozen' : '✅ Shop Reactivated',
            body: isFrozen
                ? `Your shop "${shop.name}" has been temporarily frozen by an administrator.`
                : `Your shop "${shop.name}" has been reactivated.`,
            data: {
                type: 'SHOP_FREEZE_STATUS',
                shopId: shop.id,
                isFrozen: String(isFrozen)
            }
        }).catch(err => console.error('[FCM] Shop freeze notification failed:', err.message));
    }

    return shop;
};

/**
 * Activate or suspend a provider's entire business profile
 * Sends real-time FCM notification to the provider
 */
const setProviderActiveStatus = async (providerId, isActive) => {
    const profile = await prisma.providerProfile.update({
        where: { id: providerId },
        data: { isActive },
        include: { user: true }
    });

    // 🔥 Real-time FCM push to the provider
    const userId = profile.user?.id;
    if (userId) {
        await sendNotificationToUser(userId, {
            title: isActive ? '✅ Business Reactivated' : '🔒 Business Suspended',
            body: isActive
                ? 'Your provider account has been reactivated. You can now accept bookings.'
                : 'Your provider account has been suspended by an administrator. Please contact support.',
            data: {
                type: 'PROVIDER_STATUS_CHANGE',
                isActive: String(isActive)
            }
        }).catch(err => console.error('[FCM] Provider status notification failed:', err.message));
    }

    return profile;
};

/**
 * Verify or Reject a shop application
 */
const updateShopStatus = async (id, { status, rejectionReason }) => {
    const shop = await prisma.shop.update({
        where: { id },
        data: { 
            status, 
            rejectionReason: status === 'REJECTED' ? rejectionReason : null,
            verifiedAt: status === 'VERIFIED' ? new Date() : null
        },
        include: {
            providerProfile: {
                include: { user: true }
            }
        }
    });

    const user = shop.providerProfile?.user;
    if (user) {
        // 1. Real-time FCM Notification
        await sendNotificationToUser(user.id, {
            title: status === 'VERIFIED' ? '🎉 Shop Verified!' : '❌ Shop Rejected',
            body: status === 'VERIFIED' 
                ? `Congratulations! Your shop "${shop.name}" has been verified and is now live.`
                : `Your shop "${shop.name}" was not approved. Reason: ${rejectionReason}`,
            data: {
                type: 'SHOP_VERIFICATION_STATUS',
                shopId: shop.id,
                status: status,
                rejectionReason: rejectionReason || ''
            }
        }).catch(err => console.error('[FCM] Verification notification failed:', err.message));

        // 2. Email Notification
        if (user.email) {
            await mail.sendShopVerificationEmail(user.email, user.fullName, {
                shopName: shop.name,
                status,
                rejectionReason
            }).catch(err => console.error('[Mail] Verification email failed:', err.message));
        }
    }

    return shop;
};

module.exports = {
    listCategoriesIncludingHidden,
    reorderCategories,
    updateVisibility,
    updateTrending,
    updateSubcategoryVisibility,
    getAllAds,
    createAdvertisement,
    updateAdvertisement,
    removeAd,
    listShops,
    listShopsForAdmin,
    listServices,
    setShopFreezeStatus,
    setProviderActiveStatus,
    updateShopStatus
};
