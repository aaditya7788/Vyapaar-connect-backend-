const recommendService = require('./recommend.service');

const recommendShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    const recommendation = await recommendService.submitRecommendation(userId, shopId, status);
    res.status(200).json({ status: 'success', data: recommendation });
  } catch (err) {
    res.status(err.status || 500).json({ status: 'error', message: err.message });
  }
};

module.exports = { recommendShop };
