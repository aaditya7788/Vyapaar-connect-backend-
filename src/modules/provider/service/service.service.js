const prisma = require('../../../db');
const { deleteFile } = require('../../../utils/file.utils');

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
        price: (data.price !== undefined && data.price !== null) ? parseFloat(data.price) : undefined,
        duration: data.duration,
        category,
        subcategories: subcategories || [],
        inclusions: data.inclusions,
        isActive: data.isActive !== undefined ? data.isActive : data.isAvailable,
        dailyMenu: data.dailyMenu,
        unit: data.unit,
        stock: data.stock !== undefined ? parseInt(data.stock) : undefined,
        minQuantity: data.minQuantity !== undefined ? parseInt(data.minQuantity) : undefined,
        maxQuantity: data.maxQuantity !== undefined ? parseInt(data.maxQuantity) : undefined,
        image: data.image,
        gallery: Array.isArray(data.gallery) ? data.gallery : [],
        shopId: data.shopId,
    };
    
    // Remove undefined fields
    Object.keys(cleaned).forEach(key => cleaned[key] === undefined && delete cleaned[key]);

    // Register unit if it's new (unverified)
    if (cleaned.unit) {
        try {
            await prisma.serviceUnit.upsert({
                where: { name: cleaned.unit },
                update: {},
                create: { name: cleaned.unit, isVerified: false }
            });
        } catch (e) {
            // Ignore unique constraint errors
        }
    }

    return cleaned;
};

/**
 * Create a new service for a shop
 */
const createService = async (serviceData) => {
    const data = await CLEAN_DATA(serviceData);
    
    // Extract configurable inclusions if any
    const configurableInclusions = serviceData.configurableInclusions;
    
    if (Array.isArray(configurableInclusions)) {
        data.configurableInclusions = {
            create: configurableInclusions.map(inc => ({
                name: inc.name,
                price: parseFloat(inc.price || 0)
            }))
        };
    }

    const service = await prisma.service.create({ 
        data,
        include: { configurableInclusions: true }
    });
    return mapServiceCategories(service);
};

/**
 * Get all services for a specific shop
 * Smart Filter: Only the shop owner can see Inactive/Disabled services
 */
const getServicesByShop = async (shopId, requestingUserId = null) => {
    let isOwner = false;

    // 1. Initial Identity Check & Ownership Verify
    if (requestingUserId) {
        // Find if this user owns this specific shop
        const shop = await prisma.shop.findFirst({
            where: {
                id: shopId,
                providerProfile: {
                    userId: requestingUserId
                }
            }
        });
        isOwner = !!shop;
    }

    // 2. Build explicit where clause
    const where = { shopId };
    
    // If not the owner, strictly filter for Active services only
    if (!isOwner) {
        where.isActive = true;
    }

    const services = await prisma.service.findMany({
        where,
        include: { configurableInclusions: true },
        orderBy: { name: 'asc' }
    });
    
    // Fetch all categories to join settings (Prisma doesn't support easy join on non-relation string field)
    const categoryNames = [...new Set(services.map(s => s.category).filter(Boolean))];
    const categorySettings = await prisma.category.findMany({
        where: { name: { in: categoryNames } }
    });

    const mapped = services.map(srv => {
        const settings = categorySettings.find(c => c.name === srv.category);
        return {
            ...mapServiceCategories(srv),
            categorySettings: settings ? {
                supportsQuantity: settings.supportsQuantity,
                supportsDailyMenu: settings.supportsDailyMenu,
                supportsInclusions: settings.supportsInclusions,
                supportsGallery: settings.supportsGallery,
                isAppointmentBased: settings.isAppointmentBased
            } : null
        };
    });

    return mapped;
};

/**
 * Get single service details
 */
const getServiceById = async (id) => {
    const service = await prisma.service.findUnique({
        where: { id },
        include: { configurableInclusions: true }
    });
    if (!service) return null;

    const categorySettings = await prisma.category.findFirst({
        where: { name: service.category }
    });

    return {
        ...mapServiceCategories(service),
        categorySettings: categorySettings ? {
            supportsQuantity: categorySettings.supportsQuantity,
            supportsDailyMenu: categorySettings.supportsDailyMenu,
            supportsInclusions: categorySettings.supportsInclusions,
            supportsGallery: categorySettings.supportsGallery,
            isAppointmentBased: categorySettings.isAppointmentBased
        } : null
    };
};

/**
 * Update an existing service
 */
const updateService = async (id, serviceData) => {
    // Get existing to check for image changes
    const existing = await prisma.service.findUnique({ where: { id } });
    
    const data = await CLEAN_DATA(serviceData);
    
    // Extract and handle configurable inclusions sync
    const configurableInclusions = serviceData.configurableInclusions;
    if (Array.isArray(configurableInclusions)) {
        // Delete existing and recreate for simplicity in this version
        await prisma.serviceInclusion.deleteMany({ where: { serviceId: id } });
        
        data.configurableInclusions = {
            create: configurableInclusions.map(inc => ({
                name: inc.name,
                price: parseFloat(inc.price || 0)
            }))
        };
    }

    const service = await prisma.service.update({
        where: { id },
        data,
        include: { configurableInclusions: true }
    });

    // Cleanup old image if replaced
    if (existing && data.image && existing.image && data.image !== existing.image) {
        deleteFile(existing.image);
    }

    return mapServiceCategories(service);
};

/**
 * Delete a service
 */
const deleteService = async (id) => {
    try {
        const existing = await prisma.service.findUnique({ where: { id } });
        
        const deleted = await prisma.service.delete({
            where: { id }
        });

        if (existing && existing.image) {
            deleteFile(existing.image);
        }

        return deleted;
    } catch (error) {
        // P2003: Foreign key constraint violation (e.g. service is linked to a booking)
        if (error.code === 'P2003') {
            console.log(`[SERVICE DELETE] Service ${id} has linked bookings. Performing soft-delete instead.`);
            return await prisma.service.update({
                where: { id },
                data: { isActive: false }
            });
        }
        throw error;
    }
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

/**
 * Check availability for a list of service IDs
 */
const checkAvailability = async (serviceIds) => {
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) return [];

    const services = await prisma.service.findMany({
        where: {
            id: { in: serviceIds }
        },
        select: {
            id: true,
            isActive: true,
            stock: true
        }
    });

    return services;
};

/**
 * Toggle Sold Out status (Stock to 0 or back to default)
 */
const toggleSoldOut = async (id, userId) => {
    const service = await prisma.service.findFirst({
        where: {
            id,
            shop: {
                providerProfile: {
                    userId
                }
            }
        }
    });

    if (!service) throw new Error('Service not found or unauthorized');

    // Toggle: If 0 -> -1 (Unlimited), If not 0 -> 0 (Sold Out)
    const newStock = service.stock === 0 ? -1 : 0;

    const updated = await prisma.service.update({
        where: { id },
        data: { stock: newStock }
    });
    
    return mapServiceCategories(updated);
};

/**
 * Get all unique units currently used by services
 */
const getUniqueUnits = async () => {
    const units = await prisma.serviceUnit.findMany({
        where: { isVerified: true },
        select: { name: true },
        orderBy: { name: 'asc' }
    });
    
    // Default units to always include if table is empty
    const defaultUnits = ['pcs', 'kg', 'gm', 'ltr', 'ml', 'packet', 'plate', 'hour', 'session'];
    const dbUnits = units.map(u => u.name);
    
    // Combine and remove duplicates
    return [...new Set([...defaultUnits, ...dbUnits])].sort();
};

module.exports = {
    createService,
    getServicesByShop,
    getServiceById,
    updateService,
    deleteService,
    toggleServiceStatus,
    toggleSoldOut,
    checkAvailability,
    getUniqueUnits
};
