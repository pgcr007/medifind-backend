const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { searchMedicines, createMedicine, getAlternatives } = require('../controllers/medicineController');

router.get('/search', searchMedicines);
router.post('/', authenticate, authorize('admin'), createMedicine);
router.get('/:id/alternatives', getAlternatives);

module.exports = router;