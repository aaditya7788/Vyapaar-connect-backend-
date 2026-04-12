const { createReview } = require("./review.service");

// @desc    Submit a review for a completed booking
// @route   POST /api/customer/reviews
// @access  Private (Customer)
const submitReview = async (req, res, next) => {
  try {
    const { bookingId, overallRating, comment, tags, serviceRatings } = req.body;
    
    // Validate required fields
    if (!bookingId || !overallRating) {
      return res.status(400).json({
        success: false,
        message: "bookingId and overallRating are required",
      });
    }

    const review = await createReview(req.user.id, {
      bookingId,
      overallRating,
      comment,
      tags,
      serviceRatings,
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (error) {
    if (error.message.includes("not yours to review") || error.message.includes("already reviewed")) {
       return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Error in submitReview:", error);
    next(error);
  }
};

module.exports = {
  submitReview,
};
