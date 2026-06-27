const Inventory = require('../models/Inventory');
const Pharmacy = require('../models/Pharmacy');

// PUT /inventory/:pharmacyId  — pharmacy owner updates/creates stock entries
async function updateInventory(req, res) {
  try {
    const { pharmacyId } = req.params;
    const { medicineId, stockQty, price } = req.body;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    const entry = await Inventory.findOneAndUpdate(
      { pharmacyId, medicineId },
      { stockQty, price },
      { upsert: true, new: true }
    );

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getInventoryByPharmacy(req, res) {
  try {
    const items = await Inventory.find({ pharmacyId: req.params.pharmacyId }).populate('medicineId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { updateInventory, getInventoryByPharmacy };