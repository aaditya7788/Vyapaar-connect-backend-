const express = require('express');
const router = express.Router();
const discoveryController = require('./discovery.controller');

/**
 * GET /discovery/home
 * Returns Banners, Categories, Trending Shops etc.
 */
router.get('/home', discoveryController.getHomeData);

/**
 * GET /discovery/search
 * Global Search for Shops and Services
 */
router.get('/search', discoveryController.searchDiscovery);

/**
 * GET /discovery/home-services
 * Locatio-based nearby services grouped by category
 */
router.get('/home-services', discoveryController.getHomeServices);

/**
 * GET /discovery/trending-keywords
 * Most searched or admin pinned keywords
 */
router.get('/trending-keywords', discoveryController.getTrendingKeywords);

/**
 * GET /discovery/insights
 * Admin Search Analytics
 */
router.get('/insights', discoveryController.getSearchInsights);

module.exports = router;
