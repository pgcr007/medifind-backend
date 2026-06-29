const Medicine = require('../models/Medicine');

async function searchMedicines(req, res) {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'name query parameter is required' });
    }
    const medicines = await Medicine.find({
      name: { $regex: name, $options: 'i' }
    }).limit(20);
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createMedicine(req, res) {
  try {
    const { name, genericName, category } = req.body;
    const medicine = await Medicine.create({ name, genericName, category });
    res.status(201).json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAlternatives(req, res) {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

    if (!medicine.genericName) {
      return res.json({ alternatives: [] });
    }

    const alternatives = await Medicine.find({
      genericName: medicine.genericName,
      _id: { $ne: medicine._id }
    }).limit(5);

    res.json({ alternatives });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


module.exports = { searchMedicines, createMedicine, getAlternatives };