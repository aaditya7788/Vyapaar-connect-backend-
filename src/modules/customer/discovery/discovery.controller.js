const discoveryService = require('./discovery.service');

/**
 * TITLE: Service Discovery Controller
 * DESCRIPTION: Powers the home screen and search functionality. Handles categories, 
 * subcategories, and search result ranking for customers finding services.
 */

/**
 * GET /discovery/home
 * Returns the Home Feed Data
 */
const getHomeData = async (req, res) => {
  try {
    const data = await discoveryService.getHomeFeed();
    res.status(200).json({ status: 'success', ...data });
  } catch (error) {
    console.error('[HOME DATA ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch home feed.' });
  }
};

/**
 * GET /discovery/search
 * Returns Filtered Discovery Results (Shops/Services)
 */
const searchDiscovery = async (req, res) => {
  try {
    const data = await discoveryService.searchDiscovery(req.query, req.user?.id);
    res.status(200).json({ status: 'success', ...data });
  } catch (error) {
    console.error('[SEARCH ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Search failed.' });
  }
};

/**
 * GET /discovery/home-services
 * Returns nearby services grouped by category.
 */
const getHomeServices = async (req, res) => {
  try {
    const { lat, lng, radiusKm } = req.query;
    const data = await discoveryService.getHomeServices(lat, lng, radiusKm);
    res.status(200).json({ status: 'success', ...data });
  } catch (error) {
    console.error('[HOME SERVICES ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch home services.' });
  }
};

/**
 * GET /discovery/trending-keywords
 */
const getTrendingKeywords = async (req, res) => {
  try {
    const data = await discoveryService.getTrendingKeywords();
    res.status(200).json({ status: 'success', keywords: data });
  } catch (error) {
    console.error('[TRENDING KEYWORDS ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch trending keywords.' });
  }
};

/**
 * GET /discovery/insights
 * Admin only Search Analytics
 */
const getSearchInsights = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await discoveryService.getSearchInsights(parseInt(days));
    res.status(200).json({ status: 'success', insights: data });
  } catch (error) {
    console.error('[SEARCH INSIGHTS ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch search insights.' });
  }
};

module.exports = {
  getHomeData,
  searchDiscovery,
  getHomeServices,
  getTrendingKeywords,
  getSearchInsights
};
