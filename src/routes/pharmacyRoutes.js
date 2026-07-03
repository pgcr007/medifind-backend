const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createPharmacy, getPharmacyById, updatePharmacy, getNearbyPharmacies, getMyPharmacy } = require('../controllers/pharmacyController');

router.post('/', authenticate, authorize('pharmacy'), createPharmacy);
router.get('/nearby', getNearbyPharmacies);
router.get('/mine', authenticate, authorize('pharmacy'), getMyPharmacy);
router.get('/:id', getPharmacyById);
router.put('/:id', authenticate, authorize('pharmacy'), updatePharmacy);

module.exports = router;