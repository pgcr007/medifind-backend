const cron = require('node-cron');
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const { sendPushNotification } = require('../config/firebase');

async function checkDueRefills() {
  try {
    const reminders = await Reminder.find({ isActive: true, refillReminderSent: false })
      .populate('medicineId');

    const now = new Date();

    for (const reminder of reminders) {
      const daysSinceRefill = Math.floor(
        (now - reminder.lastRefillDate) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceRefill >= reminder.refillIntervalDays) {
        const user = await User.findById(reminder.userId);
        if (!user || !user.fcmToken) continue;

        const medicineName = reminder.medicineId?.name || 'your medicine';

        await sendPushNotification(
          user.fcmToken,
          'Refill Reminder',
          `Time to refill ${medicineName}. It's been ${daysSinceRefill} days since your last refill.`,
          { type: 'refill_reminder', medicineId: String(reminder.medicineId._id) }
        );

        reminder.refillReminderSent = true;
        await reminder.save();
      }
    }
  } catch (err) {
    console.error('Refill check job error:', err.message);
  }
}

function startRefillCheckJob() {
  // Runs once a day at 9 AM server time. Render free tier sleeps when idle,
  // so this only fires reliably if the service receives traffic to stay awake,
  // or you wire an external uptime pinger (e.g. UptimeRobot, free) to hit
  // a /health endpoint periodically.
  cron.schedule('0 9 * * *', () => {
    console.log('Running daily refill check...');
    checkDueRefills();
  });
}

module.exports = { startRefillCheckJob, checkDueRefills };