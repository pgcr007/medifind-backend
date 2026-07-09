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

    // Re-fetch with populate so Android gets medicineId as a full object
    const populated = await Reminder.findById(reminder._id).populate('medicineId');
    res.status(201).json(populated);
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

    // Re-fetch with populate so Android gets medicineId as a full object
    const populated = await Reminder.findById(reminder._id).populate('medicineId');
    res.json(populated);
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