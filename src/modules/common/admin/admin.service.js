const prisma = require('../../../db');
const { deleteFile } = require('../../../utils/file.utils');

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
 * Services List for linking
 */
const listServices = async () => {
    return await prisma.service.findMany({
        select: { id: true, name: true, category: true, subcategories: true, shopId: true }
    });
};

const setShopFreezeStatus = async (id, isFrozen) => {
    return await prisma.shop.update({
        where: { id },
        data: { isFrozen }
    });
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
  listServices,
  setShopFreezeStatus
};
