const categoryService = require('./category.service');
const response = require('../../../utils/response');
const { uploadToS3 } = require('../../../utils/s3Service');

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
        const { name, icon, supportsQuantity, mascotImage, startOtpRequired } = req.body;
        if (!name) return response.error(res, 'Name is required', 'VALIDATION_ERROR', 400);

        let iconUrl = icon;
        let mascotImageUrl = mascotImage;

        // Handle File Uploads to S3
        if (req.files) {
            if (req.files.icon?.[0]) {
                iconUrl = await uploadToS3(req.files.icon[0].buffer, req.files.icon[0].originalname, 'categories/icons');
            }
            if (req.files.mascotImage?.[0]) {
                mascotImageUrl = await uploadToS3(req.files.mascotImage[0].buffer, req.files.mascotImage[0].originalname, 'categories/mascots');
            }
        }

        const category = await categoryService.createCategory({ 
            name, 
            icon: iconUrl, 
            supportsQuantity: supportsQuantity === 'true' || supportsQuantity === true, 
            mascotImage: mascotImageUrl, 
            startOtpRequired: startOtpRequired === 'true' || startOtpRequired === true
        });
        return response.success(res, 'Category created', category, 201);
    } catch (error) {
        console.error('[CATEGORY CREATE ERROR]:', error);
        return response.error(res, 'Failed to create category');
    }
};

/**
 * Update Category
 */
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Handle Type Conversions for FormData
        if (updateData.supportsQuantity !== undefined) {
            updateData.supportsQuantity = updateData.supportsQuantity === 'true' || updateData.supportsQuantity === true;
        }
        if (updateData.startOtpRequired !== undefined) {
            updateData.startOtpRequired = updateData.startOtpRequired === 'true' || updateData.startOtpRequired === true;
        }

        // Handle File Uploads to S3
        if (req.files) {
            if (req.files.icon?.[0]) {
                updateData.icon = await uploadToS3(req.files.icon[0].buffer, req.files.icon[0].originalname, 'categories/icons');
            }
            if (req.files.mascotImage?.[0]) {
                updateData.mascotImage = await uploadToS3(req.files.mascotImage[0].buffer, req.files.mascotImage[0].originalname, 'categories/mascots');
            }
        }

        const category = await categoryService.updateCategory(id, updateData);
        return response.success(res, 'Category updated', category);
    } catch (error) {
        console.error('[CATEGORY UPDATE ERROR]:', error);
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

