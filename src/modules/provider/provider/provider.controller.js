const providerService = require('./provider.service');

const onboard = async (req, res) => {
  try {
    const result = await providerService.onboardProvider(req.user.id, req.body);
    res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const addShop = async (req, res) => {
  try {
    const shop = await providerService.createShop(req.user.id, req.body);
    res.status(201).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const listShops = async (req, res) => {
  try {
    const shops = await providerService.getShopsByUserId(req.user.id);
    res.status(200).json({ status: 'success', data: shops });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await providerService.updateShop(req.user.id, id, req.body);
    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateShopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const shop = await providerService.updateShopStatus(req.user.id, id, { status, rejectionReason });
    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const deleteShop = async (req, res) => {
  try {
    const { id } = req.params;
    await providerService.deleteShop(req.user.id, id);
    res.status(200).json({ status: 'success', message: 'Shop deleted successfully' });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getShopById = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await providerService.getShopById(id);
    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await providerService.getProviderDashboardStats(req.user.id, id);
    res.status(200).json({ status: 'success', data: stats });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  onboard,
  addShop,
  listShops,
  updateShop,
  updateShopStatus,
  deleteShop,
  getShopById,
  getDashboard,
};
