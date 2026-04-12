const express = require("express");
const { submitReview } = require("./review.controller");
const { authMiddleware } = require("../../../middleware/auth.middleware");

const router = express.Router();

router.post("/", authMiddleware, submitReview);

module.exports = router;
