const express = require('express');
const router = express.Router();
const addressController = require('./address.controller');
const { authMiddleware } = require('../../../middleware/auth.middleware');

// All address routes are protected
router.use(authMiddleware);

router.get('/', addressController.getAddresses);
router.post('/', addressController.createAddress);
router.put('/:id', addressController.updateAddress);
router.delete('/:id', addressController.deleteAddress);

module.exports = router;
