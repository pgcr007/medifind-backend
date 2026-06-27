const Reservation = require('../models/Reservation');
const Inventory = require('../models/Inventory');

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

module.exports = { createReservation, getMyReservations };