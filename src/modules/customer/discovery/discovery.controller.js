const discoveryService = require('./discovery.service');

/**
 * GET /discovery/home
 * Returns the Home Feed Data
 */
const getHomeData = async (req, res) => {
  try {
    const data = await discoveryService.getHomeFeed();
    res.status(200).json({ status: 'success', data });
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
    const { q, category, community } = req.query;
    const filters = { q, category, community };
    const data = await discoveryService.searchDiscovery(filters);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    console.error('[SEARCH ERROR]:', error);
    res.status(500).json({ status: 'error', message: 'Search failed.' });
  }
};

module.exports = {
  getHomeData,
  searchDiscovery
};
