const Pharmacy = require('../models/Pharmacy');
const Inventory = require('../models/Inventory');

// Register a new pharmacy (by a pharmacy-role user)
async function createPharmacy(req, res) {
  try {
    const { name, address, latitude, longitude } = req.body;
    const pharmacy = await Pharmacy.create({
      ownerUserId: req.user.id,
      name,
      address,
      latitude,
      longitude
    });
    res.status(201).json(pharmacy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /pharmacies/:id
async function getPharmacyById(req, res) {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    res.json(pharmacy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /pharmacies/nearby?lat=&lng=&medicineId=
// Simple MVP version: fetch all verified pharmacies, calculate distance in JS, filter by stock if medicineId given
async function getNearbyPharmacies(req, res) {
  try {
    const { lat, lng, medicineId } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const pharmacies = await Pharmacy.find({ verified: true });

    function distanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    let results = pharmacies.map(p => ({
      ...p.toObject(),
      distanceKm: distanceKm(parseFloat(lat), parseFloat(lng), p.latitude, p.longitude)
    }));

    if (medicineId) {
      const stocked = await Inventory.find({ medicineId, stockQty: { $gt: 0 } }).select('pharmacyId stockQty price');
      const stockMap = new Map(stocked.map(s => [s.pharmacyId.toString(), s]));
      results = results
        .filter(p => stockMap.has(p._id.toString()))
        .map(p => ({
          ...p,
          stockQty: stockMap.get(p._id.toString()).stockQty,
          price: stockMap.get(p._id.toString()).price
        }));
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createPharmacy, getPharmacyById, getNearbyPharmacies };