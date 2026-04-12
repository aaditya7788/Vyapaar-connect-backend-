const prisma = require('../../../db');

/**
 * Resolve Category and Subcategory (No longer uses IDs)
 */
const resolveCategories = async (categoryInput, subcategoriesInput) => {
    return { 
        category: (categoryInput && typeof categoryInput === 'object') ? categoryInput.name : categoryInput,
        subcategories: Array.isArray(subcategoriesInput) ? subcategoriesInput : (subcategoriesInput ? [subcategoriesInput] : [])
    };
};

/**
 * Helper to ensure category/subcategory are just strings
 */
const mapServiceCategories = (service) => {
    if (!service) return service;
    const result = { ...service };
    
    // Ensure they are strings for the frontend
    if (service.category && typeof service.category === 'object') {
        result.category = service.category.name;
    }
    if (service.subcategories && Array.isArray(service.subcategories)) {
        result.subcategories = service.subcategories;
    }
    
    // Add Labels for exact frontend compatibility
    result.categoryLabel = result.category;
    result.subcategoriesLabel = result.subcategories ? result.subcategories.join(', ') : '';
    
    return result;
};

/**
 * CLEAN_DATA — Reverted to string-only storage
 */
const CLEAN_DATA = async (data) => {
    const { category, subcategories } = await resolveCategories(data.category, data.subcategories || data.subcategory);
    
    const cleaned = {
        name: data.name,
        description: data.description,
        price: data.price ? parseFloat(data.price) : undefined,
        duration: data.duration,
        category,
        subcategories: subcategories || [],
        inclusions: data.inclusions,
        isActive: data.isActive !== undefined ? data.isActive : data.isAvailable,
        image: data.image,
        shopId: data.shopId,
    };
    
    // Remove undefined fields
    Object.keys(cleaned).forEach(key => cleaned[key] === undefined && delete cleaned[key]);
    return cleaned;
};

/**
 * Create a new service for a shop
 */
const createService = async (serviceData) => {
    const data = await CLEAN_DATA(serviceData);
    const service = await prisma.service.create({ data });
    return mapServiceCategories(service);
};

/**
 * Get all services for a specific shop
 */
const getServicesByShop = async (shopId) => {
    const services = await prisma.service.findMany({
        where: { shopId },
        orderBy: { name: 'asc' }
    });
    return services.map(mapServiceCategories);
};

/**
 * Get single service details
 */
const getServiceById = async (id) => {
    const service = await prisma.service.findUnique({
        where: { id }
    });
    return mapServiceCategories(service);
};

/**
 * Update an existing service
 */
const updateService = async (id, serviceData) => {
    const data = await CLEAN_DATA(serviceData);
    const service = await prisma.service.update({
        where: { id },
        data
    });
    return mapServiceCategories(service);
};

/**
 * Delete a service
 */
const deleteService = async (id) => {
    return await prisma.service.delete({
        where: { id }
    });
};

/**
 * Toggle active/inactive status
 */
const toggleServiceStatus = async (id, isActive) => {
    const service = await prisma.service.update({
        where: { id },
        data: { isActive: !!isActive }
    });
    return mapServiceCategories(service);
};

module.exports = {
    createService,
    getServicesByShop,
    getServiceById,
    updateService,
    deleteService,
    toggleServiceStatus
};
