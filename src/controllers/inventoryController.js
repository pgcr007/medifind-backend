const Inventory = require('../models/Inventory');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');

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

async function deleteInventoryItem(req, res) {
  try {
    const { pharmacyId, medicineId } = req.params;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    const deleted = await Inventory.findOneAndDelete({ pharmacyId, medicineId });
    if (!deleted) return res.status(404).json({ error: 'Inventory entry not found' });

    res.json({ message: 'Inventory entry removed', deletedId: deleted._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// POST /inventory/:pharmacyId/bulk — CSV-driven bulk upsert
// Validates every row before writing anything: if ANY medicine name is
// unrecognized, the whole upload is rejected and nothing is changed.
async function bulkUpsertInventory(req, res) {
  try {
    const { pharmacyId } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    // Validate + dedupe rows (last occurrence of a name wins, matching the
    // "overwrite on duplicate" decision)
    const rowsByName = new Map();
    for (const [index, row] of items.entries()) {
      const name = (row.medicineName || '').trim();
      const stockQty = Number(row.stockQty);
      const price = Number(row.price);

      if (!name) {
        return res.status(400).json({ error: `Row ${index + 1}: medicineName is required` });
      }
      if (isNaN(stockQty) || stockQty < 0) {
        return res.status(400).json({ error: `Row ${index + 1} (${name}): stockQty must be a non-negative number` });
      }
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: `Row ${index + 1} (${name}): price must be a non-negative number` });
      }

      rowsByName.set(name.toLowerCase(), { name, stockQty, price });
    }

    const uniqueRows = Array.from(rowsByName.values());

    // Case-insensitive exact-name lookup against the Medicine catalog
    const medicines = await Medicine.find({
      name: { $in: uniqueRows.map((r) => new RegExp(`^${escapeRegex(r.name)}$`, 'i')) }
    });
    const medicineByLowerName = new Map(medicines.map((m) => [m.name.toLowerCase(), m]));

    const unrecognized = uniqueRows
      .filter((r) => !medicineByLowerName.has(r.name.toLowerCase()))
      .map((r) => r.name);

    if (unrecognized.length > 0) {
      return res.status(400).json({
        error: 'Some medicines were not recognized. Fix these names and try again.',
        unrecognized
      });
    }

    const bulkOps = uniqueRows.map((row) => {
      const medicine = medicineByLowerName.get(row.name.toLowerCase());
      return {
        updateOne: {
          filter: { pharmacyId, medicineId: medicine._id },
          update: { $set: { stockQty: row.stockQty, price: row.price } },
          upsert: true
        }
      };
    });

    await Inventory.bulkWrite(bulkOps);

    res.json({ message: `${uniqueRows.length} inventory items updated`, count: uniqueRows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


module.exports = { updateInventory, getInventoryByPharmacy, deleteInventoryItem , bulkUpsertInventory };
