const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },

  // Dosage reminder schedule — handled client-side via AlarmManager,
  // but stored here so it syncs across devices
  dosageTimes: [{ type: String }], // e.g. ["08:00", "20:00"]

  // Refill tracking
  refillIntervalDays: { type: Number, required: true }, // e.g. 30
  lastRefillDate: { type: Date, default: Date.now },
  refillReminderSent: { type: Boolean, default: false },

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);