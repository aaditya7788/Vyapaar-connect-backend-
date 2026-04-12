const prisma = require('../../../db');
const fs = require('fs');
const path = require('path');

/**
 * Helper to delete physical file
 */
const deletePhysicalFile = (imageUrl) => {
    if (!imageUrl) return;
    try {
        const fileName = imageUrl.split('/').pop();
        const filePath = path.join(__dirname, '../../../../../uploads/ads', fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error('File deletion failed:', err);
    }
};

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
        deletePhysicalFile(oldAd.image);
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
        deletePhysicalFile(ad.image);
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

module.exports = {
  listCategoriesIncludingHidden,
  reorderCategories,
  updateVisibility,
  getAllAds,
  createAdvertisement,
  updateAdvertisement,
  removeAd,
  listShops,
  listServices
};
