const Reservation = require('../models/Reservation');
const Inventory = require('../models/Inventory');
const { markRefilled } = require('./reminderController');
const Pharmacy = require('../models/Pharmacy');

async function createReservation(req, res) {
  try {
    const { pharmacyId, medicineId } = req.body;

    const inventoryEntry = await Inventory.findOne({ pharmacyId, medicineId });
    if (!inventoryEntry || inventoryEntry.stockQty <= 0) {
      return res.status(409).json({ error: 'Medicine is currently out of stock at this pharmacy' });
    }

    const reservation = await Reservation.create({
      userId: req.user.id,
      pharmacyId,
      medicineId,
      status: 'pending'
    });

    // Decrement stock to reflect the reservation (simple MVP approach)
    inventoryEntry.stockQty -= 1;
    await inventoryEntry.save();

    // Reset refill clock if user has an active reminder for this medicine
    await markRefilled(req.user.id, medicineId);

    res.status(201).json(reservation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getMyReservations(req, res) {
  try {
    const reservations = await Reservation.find({ userId: req.user.id })
      .populate('pharmacyId')
      .populate('medicineId')
      .sort({ createdAt: -1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPharmacyReservations(req, res) {
  try {
    const { pharmacyId } = req.params;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    const reservations = await Reservation.find({ pharmacyId })
      .populate('userId', 'name email')
      .populate('medicineId')
      .sort({ createdAt: -1 });

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateReservationStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

    const pharmacy = await Pharmacy.findById(reservation.pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'Pharmacy not found' });

    if (pharmacy.ownerUserId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this pharmacy' });
    }

    // Restock only when moving OUT of pending into rejected/cancelled
    // (prevents double-restock if status is changed again later)
    const wasPending = reservation.status === 'pending';
    const isBeingReleased = status === 'rejected' || status === 'cancelled';

    if (wasPending && isBeingReleased) {
      await Inventory.findOneAndUpdate(
        { pharmacyId: reservation.pharmacyId, medicineId: reservation.medicineId },
        { $inc: { stockQty: 1 } }
      );
    }

    reservation.status = status;
    await reservation.save();

    const updated = await Reservation.findById(id)
      .populate('userId', 'name email')
      .populate('medicineId');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createReservation, getMyReservations, getPharmacyReservations, updateReservationStatus };
