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

module.exports = router;
