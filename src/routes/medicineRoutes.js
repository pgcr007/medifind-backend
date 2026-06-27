const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { searchMedicines, createMedicine } = require('../controllers/medicineController');

router.get('/search', searchMedicines);
router.post('/', authenticate, authorize('admin'), createMedicine);

module.exports = router;