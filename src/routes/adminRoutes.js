const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getPendingPharmacies, verifyPharmacy } = require('../controllers/adminController');

router.get('/pharmacies/pending', authenticate, authorize('admin'), getPendingPharmacies);
router.put('/pharmacies/:id/verify', authenticate, authorize('admin'), verifyPharmacy);

module.exports = router;