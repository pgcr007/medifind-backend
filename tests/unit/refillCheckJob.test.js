const mockSendPushNotification = jest.fn().mockResolvedValue('mock-message-id');

jest.mock('../../src/config/firebase', () => ({
  sendPushNotification: mockSendPushNotification,
  initFirebase: jest.fn()
}));

const { checkDueRefills } = require('../../src/jobs/refillCheckJob');
const User = require('../../src/models/User');
const Medicine = require('../../src/models/Medicine');
const Reminder = require('../../src/models/Reminder');

beforeEach(() => {
  mockSendPushNotification.mockClear();
});

async function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('checkDueRefills (daily cron job)', () => {
  it('sends a push notification for a reminder that is past its refill interval', async () => {
    const user = await User.create({ name: 'U', email: 'duerefill@test.com', passwordHash: 'x', fcmToken: 'fake-fcm-token' });
    const medicine = await Medicine.create({ name: 'Paracetamol 650mg' });
    await Reminder.create({
      userId: user._id, medicineId: medicine._id, refillIntervalDays: 30,
      lastRefillDate: await daysAgo(35), isActive: true, refillReminderSent: false
    });

    await checkDueRefills();

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      'fake-fcm-token',
      'Refill Reminder',
      expect.stringContaining('Paracetamol 650mg'),
      expect.any(Object)
    );
  });

  it('marks refillReminderSent = true after notifying, to avoid re-notifying daily', async () => {
    const user = await User.create({ name: 'U', email: 'marksent@test.com', passwordHash: 'x', fcmToken: 'fake-fcm-token' });
    const medicine = await Medicine.create({ name: 'Metformin 500mg' });
    const reminder = await Reminder.create({
      userId: user._id, medicineId: medicine._id, refillIntervalDays: 10,
      lastRefillDate: await daysAgo(15), isActive: true, refillReminderSent: false
    });

    await checkDueRefills();

    const updated = await Reminder.findById(reminder._id);
    expect(updated.refillReminderSent).toBe(true);

    // Running the job again should NOT re-notify, since the query filters on refillReminderSent: false
    await checkDueRefills();
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
  });

  it('does not notify for a reminder that is not yet due', async () => {
    const user = await User.create({ name: 'U', email: 'notdue@test.com', passwordHash: 'x', fcmToken: 'fake-fcm-token' });
    const medicine = await Medicine.create({ name: 'Losartan 50mg' });
    await Reminder.create({
      userId: user._id, medicineId: medicine._id, refillIntervalDays: 30,
      lastRefillDate: await daysAgo(5), isActive: true, refillReminderSent: false
    });

    await checkDueRefills();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('skips users with no fcmToken instead of crashing', async () => {
    const user = await User.create({ name: 'U', email: 'nofcm@test.com', passwordHash: 'x' }); // no fcmToken
    const medicine = await Medicine.create({ name: 'Amlodipine 5mg' });
    await Reminder.create({
      userId: user._id, medicineId: medicine._id, refillIntervalDays: 10,
      lastRefillDate: await daysAgo(20), isActive: true, refillReminderSent: false
    });

    await expect(checkDueRefills()).resolves.not.toThrow();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('ignores inactive reminders', async () => {
    const user = await User.create({ name: 'U', email: 'inactive@test.com', passwordHash: 'x', fcmToken: 'tok' });
    const medicine = await Medicine.create({ name: 'Omeprazole 20mg' });
    await Reminder.create({
      userId: user._id, medicineId: medicine._id, refillIntervalDays: 5,
      lastRefillDate: await daysAgo(30), isActive: false, refillReminderSent: false
    });

    await checkDueRefills();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });
});