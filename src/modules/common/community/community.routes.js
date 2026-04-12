const express = require('express');
const router = express.Router();
const communityController = require('./community.controller');

/**
 * Public enumeration of business communities
 * Used for onboarding selection and badge rendering
 */
router.get('/', communityController.listCommunities);

/**
 * Get single community info by slug
 */
router.get('/:slug', communityController.getCommunityDetails);

/**
 * Admin: Add new community
 */
router.post('/', communityController.addCommunity);

/**
 * Admin: Update community
 */
router.put('/:id', communityController.updateCommunity);

/**
 * Admin: Toggle community status
 */
router.patch('/:id/status', communityController.toggleStatus);

/**
 * Admin: Delete community
 */
router.delete('/:id', communityController.deleteCommunity);

module.exports = router;
