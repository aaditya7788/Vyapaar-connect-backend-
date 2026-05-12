const serviceService = require('./service.service');
const response = require('../../../utils/response');

/**
 * Create a new service
 */
const createService = async (req, res) => {
    try {
        const { shopId, name, price, duration, category } = req.body;
        
        if (!shopId || !name || price === undefined || price === null || !duration || !category) {
            return response.error(res, 'Missing required fields (shopId, name, price, duration, category)', 'VALIDATION_ERROR', 400);
        }

        const service = await serviceService.createService(req.body);
        return response.success(res, 'Service created successfully', service, 201);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (CREATE)]:', error);
        return response.error(res, 'Failed to create service');
    }
};

/**
 * Get all services for a shop
 */
const getShopServices = async (req, res) => {
    try {
        const { shopId } = req.params;
        if (!shopId) {
            return response.error(res, 'Shop ID is required', 'VALIDATION_ERROR', 400);
        }

        const services = await serviceService.getServicesByShop(shopId, req.user?.id);
        
        console.log(`[BACKEND SHOP SERVICES] Shop ${shopId}:`, {
            count: services.length,
            firstService: services[0]?.name,
            firstServiceSettings: services[0]?.categorySettings
        });

        return response.success(res, 'Services fetched successfully', services);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (FETCH)]:', error);
        return response.error(res, 'Failed to fetch services');
    }
};

/**
 * Update a service
 */
const updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const service = await serviceService.updateService(id, req.body);
        return response.success(res, 'Service updated successfully', service);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (UPDATE)]:', error);
        return response.error(res, 'Failed to update service');
    }
};

/**
 * Delete a service
 */
const deleteService = async (req, res) => {
    try {
        const { id } = req.params;
        await serviceService.deleteService(id);
        return response.success(res, 'Service deleted successfully');
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (DELETE)]:', error);
        return response.error(res, 'Failed to delete service');
    }
};

/**
 * Check availability for multiple services
 */
const checkAvailability = async (req, res) => {
    try {
        const { serviceIds } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) {
            return response.error(res, 'serviceIds array is required', 'VALIDATION_ERROR', 400);
        }

        const availability = await serviceService.checkAvailability(serviceIds);
        return response.success(res, 'Availability status fetched', availability);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (AVAILABILITY)]:', error);
        return response.error(res, 'Failed to check availability');
    }
};

/**
 * Toggle service active/inactive status
 */
const toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const service = await serviceService.toggleServiceStatus(id, isActive);
        return response.success(res, `Service status updated to ${isActive ? 'Active' : 'Inactive'}`, service);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (TOGGLE)]:', error);
        return response.error(res, 'Failed to update service status');
    }
};

/**
 * Toggle Sold Out status
 */
const toggleSoldOut = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const service = await serviceService.toggleSoldOut(id, userId);
        const isSoldOut = service.stock === 0;
        return response.success(res, `Service marked as ${isSoldOut ? 'Sold Out' : 'Available'}`, service);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (SOLD_OUT)]:', error);
        return response.error(res, error.message || 'Failed to toggle sold out status');
    }
};

/**
 * Get a single service by ID
 */
const getServiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const service = await serviceService.getServiceById(id);
        if (!service) {
            return response.error(res, 'Service not found', 'NOT_FOUND', 404);
        }
        
        console.log(`[BACKEND SERVICE DETAIL] ${service.name}:`, {
            category: service.category,
            hasSettings: !!service.categorySettings,
            settings: service.categorySettings
        });

        return response.success(res, 'Service fetched successfully', service);
    } catch (error) {
        console.error('[SERVICE CONTROLLER ERROR (DETAIL)]:', error);
        return response.error(res, 'Failed to fetch service detail');
    }
};

module.exports = {
    createService,
    getShopServices,
    updateService,
    deleteService,
    toggleStatus,
    toggleSoldOut,
    checkAvailability,
    getServiceById
};
