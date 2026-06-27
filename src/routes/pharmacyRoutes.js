const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createPharmacy, getPharmacyById, getNearbyPharmacies } = require('../controllers/pharmacyController');

router.post('/', authenticate, authorize('pharmacy'), createPharmacy);
router.get('/nearby', getNearbyPharmacies);
router.get('/:id', getPharmacyById);

module.exports = router;