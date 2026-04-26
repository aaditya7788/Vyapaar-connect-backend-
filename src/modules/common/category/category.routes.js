const express = require('express');
const router = express.Router();
const categoryController = require('./category.controller');

const { authMiddleware, requireRole } = require('../../../middleware/auth.middleware');
const { upload } = require('../../../middleware/upload');

const categoryUpload = upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'mascotImage', maxCount: 1 }
]);

/**
 * @route   GET /api/category
 * @desc    Get all categories with subcategories
 * @access  Public
 */
router.get('/', categoryController.getAllCategories);

/**
 * @route   GET /api/category/:id
 * @desc    Get single category with subcategories
 * @access  Public
 */
router.get('/:id', categoryController.getCategory);

/**
 * @route   POST /api/category
 * @desc    Create category
 * @access  Admin
 */
router.post('/', authMiddleware, requireRole('admin'), categoryUpload, categoryController.createCategory);

/**
 * @route   PUT /api/category/:id
 * @desc    Update category
 * @access  Admin
 */
router.put('/:id', authMiddleware, requireRole('admin'), categoryUpload, categoryController.updateCategory);

/**
 * @route   DELETE /api/category/:id
 * @desc    Delete category
 * @access  Admin
 */
router.delete('/:id', authMiddleware, requireRole('admin'), categoryController.deleteCategory);

/**
 * @route   POST /api/category/subcategory
 * @desc    Create subcategory
 * @access  Admin
 */
router.post('/subcategory', authMiddleware, requireRole('admin'), categoryController.createSubcategory);

/**
 * @route   PUT /api/category/subcategory/:id
 * @desc    Update subcategory
 * @access  Admin
 */
router.put('/subcategory/:id', authMiddleware, requireRole('admin'), categoryController.updateSubcategory);

/**
 * @route   DELETE /api/category/subcategory/:id
 * @desc    Delete subcategory
 * @access  Admin
 */
router.delete('/subcategory/:id', authMiddleware, requireRole('admin'), categoryController.deleteSubcategory);

module.exports = router;

