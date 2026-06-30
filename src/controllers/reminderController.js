const Reminder = require('../models/Reminder');

async function createReminder(req, res) {
  try {
    const { medicineId, dosageTimes, refillIntervalDays } = req.body;

    if (!medicineId || !refillIntervalDays) {
      return res.status(400).json({ error: 'medicineId and refillIntervalDays are required' });
    }

    const reminder = await Reminder.create({
      userId: req.user.id,
      medicineId,
      dosageTimes: dosageTimes || [],
      refillIntervalDays,
      lastRefillDate: new Date()
    });

    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getMyReminders(req, res) {
  try {
    const reminders = await Reminder.find({ userId: req.user.id, isActive: true })
      .populate('medicineId')
      .sort({ createdAt: -1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateReminder(req, res) {
  try {
    const { id } = req.params;
    const reminder = await Reminder.findOne({ _id: id, userId: req.user.id });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const { dosageTimes, refillIntervalDays, isActive } = req.body;
    if (dosageTimes !== undefined) reminder.dosageTimes = dosageTimes;
    if (refillIntervalDays !== undefined) reminder.refillIntervalDays = refillIntervalDays;
    if (isActive !== undefined) reminder.isActive = isActive;

    await reminder.save();
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteReminder(req, res) {
  try {
    const { id } = req.params;
    const reminder = await Reminder.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Called when user makes a new reservation for a medicine they have a reminder for —
// resets the refill clock. Call this from reservationController after creating a reservation.
async function markRefilled(userId, medicineId) {
  await Reminder.updateOne(
    { userId, medicineId, isActive: true },
    { lastRefillDate: new Date(), refillReminderSent: false }
  );
}

module.exports = {
  createReminder,
  getMyReminders,
  updateReminder,
  deleteReminder,
  markRefilled
};