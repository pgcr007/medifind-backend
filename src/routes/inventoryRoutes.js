const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { updateInventory, getInventoryByPharmacy, deleteInventoryItem } = require('../controllers/inventoryController');

router.put('/:pharmacyId', authenticate, authorize('pharmacy'), updateInventory);
router.get('/:pharmacyId', getInventoryByPharmacy);
router.delete('/:pharmacyId/:medicineId', authenticate, authorize('pharmacy'), deleteInventoryItem);


module.exports = router;