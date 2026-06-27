const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { updateInventory, getInventoryByPharmacy } = require('../controllers/inventoryController');

router.put('/:pharmacyId', authenticate, authorize('pharmacy'), updateInventory);
router.get('/:pharmacyId', getInventoryByPharmacy);

module.exports = router;