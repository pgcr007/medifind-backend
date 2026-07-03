const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listUsers,
  updateUserStatus,
  listPharmacies,
  verifyPharmacy,
  listMedicines,
  updateMedicine,
  getStats,
} = require('../controllers/adminController');

// Every route below requires an authenticated admin
router.use(authenticate, authorize('admin'));

router.get('/users', listUsers);
router.put('/users/:id/status', updateUserStatus);

router.get('/pharmacies', listPharmacies);
router.put('/pharmacies/:id/verify', verifyPharmacy);

router.get('/medicines', listMedicines);
router.put('/medicines/:id', updateMedicine);

router.get('/stats', getStats);

module.exports = router;