const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');
const Pharmacy = require('../../src/models/Pharmacy');
const Medicine = require('../../src/models/Medicine');
const Inventory = require('../../src/models/Inventory');
const Reservation = require('../../src/models/Reservation');

async function createUser(email, role = 'user') {
  await request(app).post('/api/auth/register').send({ name: 'N', email, password: 'pass123', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  const user = await User.findOne({ email });
  return { token: loginRes.body.token, userId: user._id.toString() };
}

async function seedPharmacyWithStock(stockQty = 5) {
  const { userId: ownerId, token: ownerToken } = await createUser('pharmowner@test.com', 'pharmacy');
  const pharmacy = await Pharmacy.create({
    ownerUserId: ownerId, name: 'Test Pharmacy', address: 'A', latitude: 1, longitude: 1, verified: true
  });
  const medicine = await Medicine.create({ name: 'Paracetamol 650mg', genericName: 'Paracetamol' });
  await Inventory.create({ pharmacyId: pharmacy._id, medicineId: medicine._id, stockQty, price: 20 });
  return { ownerToken, pharmacy, medicine };
}

describe('POST /api/reservations (create)', () => {
  it('creates a reservation and decrements stock by 1', async () => {
    const { pharmacy, medicine } = await seedPharmacyWithStock(5);
    const { token } = await createUser('shopper1@test.com');

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');

    const entry = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    expect(entry.stockQty).toBe(4);
  });

  it('rejects reservation when out of stock (409)', async () => {
    const { pharmacy, medicine } = await seedPharmacyWithStock(0);
    const { token } = await createUser('shopper2@test.com');

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    expect(res.status).toBe(409);
  });

  it('rejects reservation when no inventory entry exists at all (409)', async () => {
    const { userId: ownerId } = await createUser('pharmowner2@test.com', 'pharmacy');
    const pharmacy = await Pharmacy.create({
      ownerUserId: ownerId, name: 'No Stock Pharmacy', address: 'A', latitude: 1, longitude: 1
    });
    const medicine = await Medicine.create({ name: 'Ibuprofen 400mg' });
    const { token } = await createUser('shopper3@test.com');

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    expect(res.status).toBe(409);
  });

  it('requires authentication', async () => {
    const { pharmacy, medicine } = await seedPharmacyWithStock(5);
    const res = await request(app).post('/api/reservations').send({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/reservations/me', () => {
  it("returns only the logged-in user's reservations, populated", async () => {
    const { pharmacy, medicine } = await seedPharmacyWithStock(5);
    const { token } = await createUser('shopper4@test.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    const res = await request(app).get('/api/reservations/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].pharmacyId.name).toBe('Test Pharmacy'); // populated
    expect(res.body[0].medicineId.name).toBe('Paracetamol 650mg'); // populated
  });
});

describe('GET /api/reservations/pharmacy/:pharmacyId', () => {
  it('rejects a non-owner pharmacy user with 403', async () => {
    const { pharmacy, medicine } = await seedPharmacyWithStock(5);
    const { token: shopperToken } = await createUser('shopper5@test.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${shopperToken}`).send({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    const { token: otherOwnerToken } = await createUser('otherowner@test.com', 'pharmacy');
    const res = await request(app).get(`/api/reservations/pharmacy/${pharmacy._id}`).set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/reservations/:id/status', () => {
  async function makeReservation() {
    const { ownerToken, pharmacy, medicine } = await seedPharmacyWithStock(5);
    const { token: shopperToken } = await createUser('shopper6@test.com');
    const createRes = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    return { ownerToken, pharmacy, medicine, reservationId: createRes.body._id };
  }

  it('confirms a reservation without restocking', async () => {
    const { ownerToken, pharmacy, medicine, reservationId } = await makeReservation();
    const before = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    const res = await request(app)
      .put(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    const after = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    expect(after.stockQty).toBe(before.stockQty); // unchanged
  });

  it('restocks by 1 when rejecting a pending reservation', async () => {
    const { ownerToken, pharmacy, medicine, reservationId } = await makeReservation();
    const before = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    await request(app)
      .put(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'rejected' });

    const after = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    expect(after.stockQty).toBe(before.stockQty + 1);
  });

  it('does not double-restock if the status is changed again after release', async () => {
    const { ownerToken, pharmacy, medicine, reservationId } = await makeReservation();

    await request(app).put(`/api/reservations/${reservationId}/status`).set('Authorization', `Bearer ${ownerToken}`).send({ status: 'rejected' });
    const afterFirst = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    // Setting to "rejected" again should be a no-op on stock (already released, not pending anymore)
    await request(app).put(`/api/reservations/${reservationId}/status`).set('Authorization', `Bearer ${ownerToken}`).send({ status: 'rejected' });
    const afterSecond = await Inventory.findOne({ pharmacyId: pharmacy._id, medicineId: medicine._id });

    expect(afterSecond.stockQty).toBe(afterFirst.stockQty);
  });

  it('rejects an invalid status value with 400', async () => {
    const { ownerToken, reservationId } = await makeReservation();
    const res = await request(app)
      .put(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'not-a-real-status' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-owner pharmacy user with 403', async () => {
    const { reservationId } = await makeReservation();
    const { token: otherOwnerToken } = await createUser('sneakyowner@test.com', 'pharmacy');
    const res = await request(app)
      .put(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });
});