const prisma = require('../../../db');

const submitRecommendation = async (userId, shopId, status) => {
  if (!['Yes', 'No', 'Maybe'].includes(status)) {
    throw { status: 400, message: "Invalid recommendation status" };
  }

  // Check if shop exists
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw { status: 404, message: "Shop not found" };

  // Upsert the recommendation
  const recommendation = await prisma.recommendation.upsert({
    where: {
      userId_shopId: {
        userId,
        shopId
      }
    },
    update: { status },
    create: { userId, shopId, status }
  });

  return recommendation;
};

module.exports = { submitRecommendation };
