const communityService = require('./community.service');

/**
 * List all active communities
 */
const listCommunities = async (req, res) => {
    try {
        const communities = await communityService.getAllCommunities();
        res.status(200).json({
            status: 'success',
            data: communities,
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message || 'Error fetching communities',
        });
    }
};

/**
 * Detailed community info (get by UUID or Slug)
 * Smart Routing: Detects format and fetches from correct service
 */
const getCommunityDetails = async (req, res) => {
    try {
        const identifier = req.params.slug;
        if (!identifier) {
            return res.status(400).json({ status: 'error', message: 'Identifier is required' });
        }

        // Logic Check: Is it a UUID?
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let community = null;
        if (isUUID) {
            community = await communityService.getCommunityById(identifier);
        } else {
            community = await communityService.getCommunityBySlug(identifier.toLowerCase());
        }

        if (!community) {
            return res.status(404).json({
                status: 'error',
                message: 'Community not found',
            });
        }

        res.status(200).json({
            status: 'success',
            data: community,
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message || 'Error fetching community',
        });
    }
};

/**
 * Admin: Add new community
 */
const addCommunity = async (req, res) => {
    try {
        const community = await communityService.createCommunity(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Community created successfully',
            data: community,
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message || 'Error creating community',
        });
    }
};

/**
 * Admin: Update existing community
 */
const updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const community = await communityService.updateCommunity(id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Community updated successfully',
            data: community,
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message || 'Error updating community',
        });
    }
};

/**
 * Admin: Toggle active status
 */
const toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const community = await communityService.toggleCommunityStatus(id, isActive);
        res.status(200).json({
            status: 'success',
            message: `Community status updated to ${isActive ? 'Active' : 'Inactive'}`,
            data: community,
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message || 'Error updating community status',
        });
    }
};

/**
 * Admin: Delete community
 */
const deleteCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        await communityService.deleteCommunity(id);
        res.status(200).json({
            status: 'success',
            message: 'Community deleted successfully',
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message || 'Error deleting community',
        });
    }
};

module.exports = {
    listCommunities,
    getCommunityDetails,
    addCommunity,
    updateCommunity,
    toggleStatus,
    deleteCommunity,
};
