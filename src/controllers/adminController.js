const Pharmacy = require('../models/Pharmacy');

async function getPendingPharmacies(req, res) {
  try {
    const pending = await Pharmacy.find({ verified: false });
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function verifyPharmacy(req, res) {
  try {
    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { verified: true },
      { new: true }
    );
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    res.json(pharmacy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPendingPharmacies, verifyPharmacy };