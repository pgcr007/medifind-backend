const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const Reservation = require('../models/Reservation');
const Inventory = require('../models/Inventory');

// --- Users ---
async function listUsers(req, res) {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await User.find(filter).select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateUserStatus(req, res) {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- Pharmacies ---
async function listPharmacies(req, res) {
  try {
    const { verified } = req.query;
    const filter = verified !== undefined ? { verified: verified === 'true' } : {};
    const pharmacies = await Pharmacy.find(filter)
      .populate('ownerUserId', 'name email')
      .sort({ createdAt: -1 });
    res.json(pharmacies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function verifyPharmacy(req, res) {
  try {
    const { verified } = req.body;
    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified must be a boolean' });
    }
    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { verified },
      { new: true }
    ).populate('ownerUserId', 'name email');
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });
    res.json(pharmacy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- Medicines ---
async function listMedicines(req, res) {
  try {
    const { name, page = 1, limit = 50 } = req.query;
    const filter = name ? { name: { $regex: name, $options: 'i' } } : {};
    const medicines = await Medicine.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Medicine.countDocuments(filter);
    res.json({ medicines, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateMedicine(req, res) {
  try {
    const { name, genericName, category, alternatives } = req.body;
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

    if (name !== undefined) medicine.name = name;
    if (genericName !== undefined) medicine.genericName = genericName;
    if (category !== undefined) medicine.category = category;
    if (alternatives !== undefined) medicine.alternatives = alternatives;

    await medicine.save();
    res.json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- Stats ---
async function getStats(req, res) {
  try {
    const [
      totalUsers,
      totalPharmacyOwners,
      totalAdmins,
      totalPharmacies,
      verifiedPharmacies,
      totalMedicines,
      totalInventoryItems,
      pendingReservations,
      confirmedReservations,
      rejectedReservations,
      cancelledReservations,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'pharmacy' }),
      User.countDocuments({ role: 'admin' }),
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({ verified: true }),
      Medicine.countDocuments(),
      Inventory.countDocuments(),
      Reservation.countDocuments({ status: 'pending' }),
      Reservation.countDocuments({ status: 'confirmed' }),
      Reservation.countDocuments({ status: 'rejected' }),
      Reservation.countDocuments({ status: 'cancelled' }),
    ]);

    res.json({
      users: { patients: totalUsers, pharmacyOwners: totalPharmacyOwners, admins: totalAdmins },
      pharmacies: {
        total: totalPharmacies,
        verified: verifiedPharmacies,
        pending: totalPharmacies - verifiedPharmacies,
      },
      medicines: { total: totalMedicines },
      inventory: { totalItems: totalInventoryItems },
      reservations: {
        pending: pendingReservations,
        confirmed: confirmedReservations,
        rejected: rejectedReservations,
        cancelled: cancelledReservations,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listUsers,
  updateUserStatus,
  listPharmacies,
  verifyPharmacy,
  listMedicines,
  updateMedicine,
  getStats,
};