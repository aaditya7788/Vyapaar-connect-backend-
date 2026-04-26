const prisma = require('../../../db');
const { deleteFromS3 } = require('../../../utils/s3Service');

/**
 * Fetch all categories with their subcategories
 */
const getAllCategories = async () => {
    try {
        // Primary Attempt: Full Relation Fetch
        return await prisma.category.findMany({
            include: {
                subcategories: {
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        });
    } catch (e) {
        console.warn('[CATEGORIES FETCH TRANSITION WARN]: Full fetch failed, attempting lighter include');
        try {
            // Secondary Attempt: Try including just subcategories (might work if shop/service relations are the only ones broken)
            return await prisma.category.findMany({
                include: { subcategories: true },
                orderBy: { name: 'asc' }
            });
        } catch (e2) {
            console.warn('[CATEGORIES FETCH TRANSITION WARN]: Lighter include failed, attempting basic fetch');
            try {
                // Tertiary Attempt: Basic categories only
                const cats = await prisma.category.findMany({
                    orderBy: { name: 'asc' }
                });
                // Attach empty subcategories so frontend doesn't crash
                return cats.map(c => ({ ...c, subcategories: [] }));
            } catch (e3) {
                console.error('[CATEGORIES FETCH CRITICAL ERROR]:', e3.message);
                return []; // ultimate safety
            }
        }
    }
};

/**
 * Get a single category by ID
 */
const getCategoryById = async (id) => {
    try {
        return await prisma.category.findUnique({
            where: { id },
            include: { subcategories: true }
        });
    } catch (e) {
        return await prisma.category.findUnique({ where: { id } });
    }
};

/**
 * Create a new category
 */
const createCategory = async (data) => {
    return prisma.category.create({ data });
};

/**
 * Update an existing category
 */
const updateCategory = async (id, data) => {
    const existing = await prisma.category.findUnique({ where: { id } });
    const updated = await prisma.category.update({
        where: { id },
        data
    });

    // Handle Image cleanup on S3
    if (existing) {
        if (data.icon && existing.icon && data.icon !== existing.icon) {
            deleteFromS3(existing.icon);
        }
        if (data.mascotImage && existing.mascotImage && data.mascotImage !== existing.mascotImage) {
            deleteFromS3(existing.mascotImage);
        }
    }
    return updated;
};

/**
 * Delete a category
 */
const deleteCategory = async (id) => {
    const existing = await prisma.category.findUnique({ where: { id } });
    const deleted = await prisma.category.delete({
        where: { id }
    });

    if (existing) {
        if (existing.icon) deleteFromS3(existing.icon);
        if (existing.mascotImage) deleteFromS3(existing.mascotImage);
    }
    return deleted;
};

/**
 * Create a new subcategory
 */
const createSubcategory = async (data) => {
    return prisma.subcategory.create({ data });
};

/**
 * Update an existing subcategory
 */
const updateSubcategory = async (id, data) => {
    const existing = await prisma.subcategory.findUnique({ where: { id } });
    const updated = await prisma.subcategory.update({
        where: { id },
        data
    });

    if (existing && data.image && existing.image && data.image !== existing.image) {
        deleteFile(existing.image);
    }
    return updated;
};

/**
 * Delete a subcategory
 */
const deleteSubcategory = async (id) => {
    const existing = await prisma.subcategory.findUnique({ where: { id } });
    const deleted = await prisma.subcategory.delete({
        where: { id }
    });

    if (existing && existing.image) {
        deleteFile(existing.image);
    }
    return deleted;
};

/**
 * Get category by name
 */
const getCategoryByName = async (name) => {
    return prisma.category.findUnique({
        where: { name }
    });
};

/**
 * Get subcategory by name and categoryId
 */
const getSubcategoryByName = async (name, categoryId) => {
    return prisma.subcategory.findFirst({
        where: {
            name,
            categoryId
        }
    });
};

module.exports = {
    getAllCategories,
    getCategoryById,
    getCategoryByName,
    getSubcategoryByName,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubcategory,
    updateSubcategory,
    deleteSubcategory
};
