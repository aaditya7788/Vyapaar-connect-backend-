const categoryService = require('./category.service');
const response = require('../../../utils/response');

/**
 * Get all categories with subcategories
 */
const getAllCategories = async (req, res) => {
    try {
        const categories = await categoryService.getAllCategories();
        return response.success(res, 'Categories fetched successfully', categories);
    } catch (error) {
        console.error('[CATEGORY CONTROLLER ERROR (FETCH)]:', error);
        return response.error(res, 'Failed to fetch categories');
    }
};

/**
 * Get single category
 */
const getCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryService.getCategoryById(id);
        if (!category) {
            return response.error(res, 'Category not found', 'NOT_FOUND', 404);
        }
        return response.success(res, 'Category fetched successfully', category);
    } catch (error) {
        console.error('[CATEGORY CONTROLLER ERROR (FETCH_SINGLE)]:', error);
        return response.error(res, 'Failed to fetch category');
    }
};

/**
 * Create Category
 */
const createCategory = async (req, res) => {
    try {
        const { name, icon } = req.body;
        if (!name) return response.error(res, 'Name is required', 'VALIDATION_ERROR', 400);
        const category = await categoryService.createCategory({ name, icon });
        return response.success(res, 'Category created', category, 201);
    } catch (error) {
        return response.error(res, 'Failed to create category');
    }
};

/**
 * Update Category
 */
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryService.updateCategory(id, req.body);
        return response.success(res, 'Category updated', category);
    } catch (error) {
        return response.error(res, 'Failed to update category');
    }
};

/**
 * Delete Category
 */
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await categoryService.deleteCategory(id);
        return response.success(res, 'Category deleted');
    } catch (error) {
        return response.error(res, 'Failed to delete category');
    }
};

/**
 * Create Subcategory
 */
const createSubcategory = async (req, res) => {
    try {
        const { name, icon, categoryId } = req.body;
        if (!name || !categoryId) return response.error(res, 'Name and categoryId required', 'VALIDATION_ERROR', 400);
        const subcategory = await categoryService.createSubcategory({ name, icon, categoryId });
        return response.success(res, 'Subcategory created', subcategory, 201);
    } catch (error) {
        return response.error(res, 'Failed to create subcategory');
    }
};

/**
 * Update Subcategory
 */
const updateSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const subcategory = await categoryService.updateSubcategory(id, req.body);
        return response.success(res, 'Subcategory updated', subcategory);
    } catch (error) {
        return response.error(res, 'Failed to update subcategory');
    }
};


/**
 * Delete Subcategory
 */
const deleteSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        await categoryService.deleteSubcategory(id);
        return response.success(res, 'Subcategory deleted');
    } catch (error) {
        return response.error(res, 'Failed to delete subcategory');
    }
};

module.exports = {
    getAllCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubcategory,
    updateSubcategory,
    deleteSubcategory
};

