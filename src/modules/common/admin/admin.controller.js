const adminService = require('./admin.service');

const getHomeCategories = async (req, res) => {
  try {
    const categories = await adminService.listCategoriesIncludingHidden();
    res.status(200).json({ status: 'success', data: categories });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateCategoriesOrder = async (req, res) => {
  try {
    const { orderings } = req.body; // Array of { id, order }
    const result = await adminService.reorderCategories(orderings);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const toggleCategoryVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;
    const category = await adminService.updateVisibility(id, isVisible);
    res.status(200).json({ status: 'success', data: category });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const toggleTrending = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, isTrending } = req.body;
    const result = await adminService.updateTrending(type, id, isTrending);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const toggleSubcategoryVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;
    const result = await adminService.updateSubcategoryVisibility(id, isVisible);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const listAds = async (req, res) => {
  try {
    const ads = await adminService.getAllAds();
    res.status(200).json({ status: 'success', data: ads });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const createAd = async (req, res) => {
  try {
    const ad = await adminService.createAdvertisement(req.body);
    res.status(201).json({ status: 'success', data: ad });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const ad = await adminService.updateAdvertisement(id, req.body);
    res.status(200).json({ status: 'success', data: ad });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.removeAd(id);
    res.status(200).json({ status: 'success', message: 'Ad deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getShopsForAdmin = async (req, res) => {
  try {
    const shops = await adminService.listShops();
    res.status(200).json({ status: 'success', data: shops });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getAllShopsForAdmin = async (req, res) => {
  try {
    const shops = await adminService.listShopsForAdmin(req.query);
    res.status(200).json({ status: 'success', data: shops });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getServicesForAdmin = async (req, res) => {
  try {
    const services = await adminService.listServices();
    res.status(200).json({ status: 'success', data: services });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const freezeShop = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFrozen } = req.body;
    const shop = await adminService.setShopFreezeStatus(id, isFrozen);
    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateProviderStatus = async (req, res) => {
  try {
    const { id } = req.params; // providerProfile id
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ status: 'fail', message: 'isActive (boolean) is required' });
    }
    const profile = await adminService.setProviderActiveStatus(id, isActive);
    res.status(200).json({ status: 'success', data: profile });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const updateShopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const shop = await adminService.updateShopStatus(id, { status, rejectionReason });
    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const toggleReviewVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;
    const review = await adminService.updateReviewVisibility(id, isPublic);
    res.status(200).json({ status: 'success', data: review });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const getShopBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getShopBookingsForAdmin(id, req.query);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

const removeReview = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.removeReview(id);
    res.status(200).json({ status: 'success', message: 'Review deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  getHomeCategories,
  updateCategoriesOrder,
  toggleCategoryVisibility,
  toggleTrending,
  toggleSubcategoryVisibility,
  listAds,
  createAd,
  updateAd,
  deleteAd,
  getShopsForAdmin,
  getAllShopsForAdmin,
  getServicesForAdmin,
  getShopBookings,
  freezeShop,
  updateProviderStatus,
  updateShopStatus,
  toggleReviewVisibility,
  removeReview
};
