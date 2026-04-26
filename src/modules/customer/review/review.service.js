const prisma = require('../../../db');

const createReview = async (userId, data) => {
  const { bookingId, overallRating, comment, tags, serviceRatings } = data;

  // Verify booking belongs to user and is COMPLETED
  const booking = await prisma.booking.findFirst({
    where: { 
      id: bookingId,
      userId: userId,
      status: "COMPLETED"
    },
    include: {
      review: true
    }
  });

  if (!booking) {
    throw new Error("Booking not found, not completed, or not yours to review");
  }

  if (booking.review) {
    throw new Error("Booking already reviewed");
  }

  // Use a transaction since we update multiple tables (calculating new average)
  return await prisma.$transaction(async (tx) => {
    // 1. Create Review & nested ServiceRating
    const reviewPayload = {
      bookingId,
      userId,
      shopId: booking.shopId,
      overallRating,
      comment,
      tags: tags || [],
    };

    if (serviceRatings && serviceRatings.length > 0) {
      reviewPayload.serviceRatings = {
        create: serviceRatings.map(sr => ({
          serviceId: sr.serviceId,
          rating: sr.rating,
          comment: sr.comment
        }))
      };
    }

    const review = await tx.review.create({
      data: reviewPayload,
      include: {
        serviceRatings: true
      }
    });

    // 2. Update Shop Average
    const shop = await tx.shop.findUnique({ where: { id: booking.shopId } });
    const newShopCount = shop.reviewCount + 1;
    // Old total sum + new rating / new count
    const newShopTotal = (shop.averageRating * shop.reviewCount) + overallRating;
    const newShopAverage = newShopTotal / newShopCount;

    await tx.shop.update({
      where: { id: booking.shopId },
      data: {
        reviewCount: newShopCount,
        averageRating: parseFloat(newShopAverage.toFixed(1))
      }
    });

    // 3. Update Service Averages
    if (serviceRatings && serviceRatings.length > 0) {
      for (const sr of serviceRatings) {
        const service = await tx.service.findUnique({ where: { id: sr.serviceId } });
        if (service) {
          const newServiceCount = service.reviewCount + 1;
          const newServiceTotal = (service.averageRating * service.reviewCount) + sr.rating;
          const newServiceAverage = newServiceTotal / newServiceCount;

          await tx.service.update({
            where: { id: sr.serviceId },
            data: {
              reviewCount: newServiceCount,
              averageRating: parseFloat(newServiceAverage.toFixed(1))
            }
          });
        }
      }
    }

    return review;
  });
};

module.exports = {
  createReview,
};
