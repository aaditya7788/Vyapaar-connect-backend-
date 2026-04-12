const prisma = require('../../../db');

/**
 * List all active communities
 */
const getAllCommunities = async () => {
    try {
        return await prisma.community.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });
    } catch (error) {
        console.error('[GET COMMUNITIES ERROR]:', error.message);
        throw error;
    }
};

/**
 * Get community by ID (UUID)
 */
const getCommunityById = async (id) => {
    try {
        return await prisma.community.findUnique({
            where: { id },
        });
    } catch (error) {
        console.error('[GET COMMUNITY BY ID ERROR]:', error.message);
        throw error;
    }
};

/**
 * Get community by slug (e.g. 'runwal')
 */
const getCommunityBySlug = async (slug) => {
    try {
        return await prisma.community.findUnique({
            where: { slug },
        });
    } catch (error) {
        console.error('[GET COMMUNITY BY SLUG ERROR]:', error.message);
        throw error;
    }
};

/**
 * Admin: Create new community
 */
const createCommunity = async (communityData) => {
    try {
        return await prisma.community.create({
            data: communityData,
        });
    } catch (error) {
        console.error('[CREATE COMMUNITY ERROR]:', error.message);
        throw error;
    }
};

/**
 * Admin: Update existing community
 */
const updateCommunity = async (id, communityData) => {
    try {
        return await prisma.community.update({
            where: { id },
            data: communityData,
        });
    } catch (error) {
        console.error('[UPDATE COMMUNITY ERROR]:', error.message);
        throw error;
    }
};

/**
 * Admin: Delete community
 */
const deleteCommunity = async (id) => {
    try {
        return await prisma.community.delete({
            where: { id },
        });
    } catch (error) {
        console.error('[DELETE COMMUNITY ERROR]:', error.message);
        throw error;
    }
};

/**
 * Admin: Toggle active status
 */
const toggleCommunityStatus = async (id, isActive) => {
    try {
        return await prisma.community.update({
            where: { id },
            data: { isActive },
        });
    } catch (error) {
        console.error('[TOGGLE COMMUNITY ERROR]:', error.message);
        throw error;
    }
};

module.exports = {
    getAllCommunities,
    getCommunityBySlug,
    getCommunityById,
    createCommunity,
    updateCommunity,
    deleteCommunity,
    toggleCommunityStatus,
};
