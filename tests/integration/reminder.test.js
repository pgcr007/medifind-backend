const request = require('supertest');
const app = require('../../app');
const Medicine = require('../../src/models/Medicine');
const Reminder = require('../../src/models/Reminder');

async function createLoggedInUser(email) {
  await request(app).post('/api/auth/register').send({ name: 'N', email, password: 'pass123' });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return loginRes.body.token;
}

describe('POST /api/reminders (create)', () => {
  it('creates a reminder with medicineId populated in the response', async () => {
    const token = await createLoggedInUser('reminder1@test.com');
    const medicine = await Medicine.create({ name: 'Metformin 500mg' });

    const res = await request(app)
      .post('/api/reminders')
      .set('Authorization', `Bearer ${token}`)
      .send({ medicineId: medicine._id, dosageTimes: ['08:00', '20:00'], refillIntervalDays: 30 });

    expect(res.status).toBe(201);
    // medicineId must come back as a populated object, not a bare string —
    // Android's Gson layer throws "Expected BEGIN_OBJECT but was STRING" otherwise
    expect(res.body.medicineId).toBeInstanceOf(Object);
    expect(res.body.medicineId.name).toBe('Metformin 500mg');
  });

  it('rejects missing required fields with 400', async () => {
    const token = await createLoggedInUser('reminder2@test.com');
    const res = await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reminders (list)', () => {
  it("only returns the logged-in user's active reminders, populated", async () => {
    const token = await createLoggedInUser('reminder3@test.com');
    const otherToken = await createLoggedInUser('reminder4@test.com');
    const medicine = await Medicine.create({ name: 'Atorvastatin 20mg' });

    await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({ medicineId: medicine._id, refillIntervalDays: 15 });
    await request(app).post('/api/reminders').set('Authorization', `Bearer ${otherToken}`).send({ medicineId: medicine._id, refillIntervalDays: 15 });

    const res = await request(app).get('/api/reminders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].medicineId.name).toBe('Atorvastatin 20mg'); // populated
  });

  it('excludes inactive (soft-deleted) reminders', async () => {
    const token = await createLoggedInUser('reminder5@test.com');
    const medicine = await Medicine.create({ name: 'Losartan 50mg' });
    const createRes = await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({ medicineId: medicine._id, refillIntervalDays: 30 });

    await request(app).put(`/api/reminders/${createRes.body._id}`).set('Authorization', `Bearer ${token}`).send({ isActive: false });

    const res = await request(app).get('/api/reminders').set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBe(0);
  });
});

describe('PUT /api/reminders/:id and DELETE /api/reminders/:id (ownership)', () => {
  it("returns 404 when trying to update another user's reminder (not 403 — doesn't reveal it exists)", async () => {
    const token = await createLoggedInUser('reminder6@test.com');
    const otherToken = await createLoggedInUser('reminder7@test.com');
    const medicine = await Medicine.create({ name: 'Amlodipine 5mg' });
    const createRes = await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({ medicineId: medicine._id, refillIntervalDays: 30 });

    const res = await request(app)
      .put(`/api/reminders/${createRes.body._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ refillIntervalDays: 1 });

    expect(res.status).toBe(404);
  });

  it("returns 404 when trying to delete another user's reminder", async () => {
    const token = await createLoggedInUser('reminder8@test.com');
    const otherToken = await createLoggedInUser('reminder9@test.com');
    const medicine = await Medicine.create({ name: 'Omeprazole 20mg' });
    const createRes = await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({ medicineId: medicine._id, refillIntervalDays: 30 });

    const res = await request(app).delete(`/api/reminders/${createRes.body._id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);

    const stillExists = await Reminder.findById(createRes.body._id);
    expect(stillExists).not.toBeNull();
  });
});

describe('markRefilled (called internally when a reservation is made)', () => {
  it('resets lastRefillDate and refillReminderSent when the user reserves the same medicine', async () => {
    const token = await createLoggedInUser('reminder10@test.com');
    const medicine = await Medicine.create({ name: 'Paracetamol 650mg' });
    const createRes = await request(app).post('/api/reminders').set('Authorization', `Bearer ${token}`).send({ medicineId: medicine._id, refillIntervalDays: 30 });

    // Simulate an overdue, already-notified reminder
    await Reminder.findByIdAndUpdate(createRes.body._id, {
      lastRefillDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      refillReminderSent: true
    });

    // Set up a pharmacy + stock so a reservation can succeed
    const Pharmacy = require('../../src/models/Pharmacy');
    const Inventory = require('../../src/models/Inventory');
    const User = require('../../src/models/User');
    const owner = await User.create({ name: 'Owner', email: 'reminderowner@test.com', passwordHash: 'x', role: 'pharmacy' });
    const pharmacy = await Pharmacy.create({ ownerUserId: owner._id, name: 'P', address: 'A', latitude: 1, longitude: 1 });
    await Inventory.create({ pharmacyId: pharmacy._id, medicineId: medicine._id, stockQty: 5, price: 10 });

    await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    const reminder = await Reminder.findById(createRes.body._id);
    expect(reminder.refillReminderSent).toBe(false);
    expect(reminder.lastRefillDate.getTime()).toBeGreaterThan(Date.now() - 60 * 1000); // reset to "now"
  });
});