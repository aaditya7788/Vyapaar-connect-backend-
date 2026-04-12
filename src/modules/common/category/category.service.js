const prisma = require('../../../db');

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
    return prisma.category.update({
        where: { id },
        data
    });
};

/**
 * Delete a category
 */
const deleteCategory = async (id) => {
    return prisma.category.delete({
        where: { id }
    });
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
    return prisma.subcategory.update({
        where: { id },
        data
    });
};

/**
 * Delete a subcategory
 */
const deleteSubcategory = async (id) => {
    return prisma.subcategory.delete({
        where: { id }
    });
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
