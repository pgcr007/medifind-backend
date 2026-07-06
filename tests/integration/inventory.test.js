const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');
const Pharmacy = require('../../src/models/Pharmacy');
const Medicine = require('../../src/models/Medicine');
const Inventory = require('../../src/models/Inventory');

async function createPharmacyOwner(email = 'owner@test.com') {
  await request(app).post('/api/auth/register').send({
    name: 'Pharmacy Owner', email, password: 'pass123', role: 'pharmacy'
  });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  const user = await User.findOne({ email });
  return { token: loginRes.body.token, userId: user._id.toString() };
}

async function createPlainUser(email = 'shopper@test.com') {
  await request(app).post('/api/auth/register').send({
    name: 'Shopper', email, password: 'pass123', role: 'user'
  });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return loginRes.body.token;
}

async function createPharmacy(ownerUserId) {
  return Pharmacy.create({
    ownerUserId,
    name: 'Test Pharmacy',
    address: '123 Test St',
    latitude: 19.2403,
    longitude: 73.1305
  });
}

async function createMedicine(name, genericName) {
  return Medicine.create({ name, genericName });
}

describe('PUT /api/inventory/:pharmacyId (single item update)', () => {
  it('allows the owning pharmacy to create/update a stock entry', async () => {
    const { token, userId } = await createPharmacyOwner();
    const pharmacy = await createPharmacy(userId);
    const medicine = await createMedicine('Paracetamol 650mg', 'Paracetamol');

    const res = await request(app)
      .put(`/api/inventory/${pharmacy._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ medicineId: medicine._id, stockQty: 50, price: 20 });

    expect(res.status).toBe(200);
    expect(res.body.stockQty).toBe(50);
  });

  it('rejects a non-owner pharmacy user with 403', async () => {
    const { userId: ownerId } = await createPharmacyOwner('realowner@test.com');
    const pharmacy = await createPharmacy(ownerId);
    const medicine = await createMedicine('Crocin 650mg', 'Paracetamol');

    const { token: otherToken } = await createPharmacyOwner('otherowner@test.com');

    const res = await request(app)
      .put(`/api/inventory/${pharmacy._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ medicineId: medicine._id, stockQty: 10, price: 15 });

    expect(res.status).toBe(403);
  });

  it('rejects a plain "user" role (not "pharmacy") with 403', async () => {
    const { userId } = await createPharmacyOwner();
    const pharmacy = await createPharmacy(userId);
    const medicine = await createMedicine('Ibuprofen 400mg', 'Ibuprofen');
    const shopperToken = await createPlainUser();

    const res = await request(app)
      .put(`/api/inventory/${pharmacy._id}`)
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ medicineId: medicine._id, stockQty: 10, price: 15 });

    expect(res.status).toBe(403);
  });

  it('rejects requests with no auth token with 401', async () => {
    const { userId } = await createPharmacyOwner();
    const pharmacy = await createPharmacy(userId);
    const res = await request(app).put(`/api/inventory/${pharmacy._id}`).send({ stockQty: 5, price: 5 });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent pharmacy', async () => {
    const { token } = await createPharmacyOwner();
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .put(`/api/inventory/${fakeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stockQty: 5, price: 5 });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/inventory/:pharmacyId/bulk (CSV bulk upload)', () => {
  async function setup() {
    const { token, userId } = await createPharmacyOwner();
    const pharmacy = await createPharmacy(userId);
    await createMedicine('Paracetamol 650mg', 'Paracetamol');
    await createMedicine('Crocin 650mg', 'Paracetamol');
    return { token, pharmacy };
  }

  it('upserts all rows when every medicine name is recognized', async () => {
    const { token, pharmacy } = await setup();
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { medicineName: 'Paracetamol 650mg', stockQty: 100, price: 20 },
          { medicineName: 'Crocin 650mg', stockQty: 40, price: 25 }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const entries = await Inventory.find({ pharmacyId: pharmacy._id });
    expect(entries.length).toBe(2);
  });

  it('is case-insensitive when matching medicine names', async () => {
    const { token, pharmacy } = await setup();
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ medicineName: 'paracetamol 650MG', stockQty: 10, price: 20 }] });

    expect(res.status).toBe(200);
  });

  it('rejects the ENTIRE batch if even one name is unrecognized (all-or-nothing)', async () => {
    const { token, pharmacy } = await setup();
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { medicineName: 'Paracetamol 650mg', stockQty: 100, price: 20 }, // valid
          { medicineName: 'Not A Real Medicine XYZ', stockQty: 5, price: 5 } // invalid
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.unrecognized).toContain('Not A Real Medicine XYZ');

    // Confirm the valid row was NOT partially applied
    const entries = await Inventory.find({ pharmacyId: pharmacy._id });
    expect(entries.length).toBe(0);
  });

  it('overwrites existing stock on duplicate medicine names (last row wins)', async () => {
    const { token, pharmacy } = await setup();
    await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ medicineName: 'Paracetamol 650mg', stockQty: 100, price: 20 }] });

    // Re-upload the same medicine with different values, plus a same-batch duplicate
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { medicineName: 'Paracetamol 650mg', stockQty: 5, price: 10 },
          { medicineName: 'Paracetamol 650mg', stockQty: 999, price: 30 } // should win
        ]
      });

    expect(res.status).toBe(200);
    const entries = await Inventory.find({ pharmacyId: pharmacy._id });
    expect(entries.length).toBe(1);
    expect(entries[0].stockQty).toBe(999);
    expect(entries[0].price).toBe(30);
  });

  it('rejects negative stockQty/price with 400 and applies nothing', async () => {
    const { token, pharmacy } = await setup();
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ medicineName: 'Paracetamol 650mg', stockQty: -5, price: 20 }] });

    expect(res.status).toBe(400);
    const entries = await Inventory.find({ pharmacyId: pharmacy._id });
    expect(entries.length).toBe(0);
  });

  it('rejects a non-owner pharmacy user with 403', async () => {
    const { pharmacy } = await setup();
    const { token: otherToken } = await createPharmacyOwner('otherbulk@test.com');
    const res = await request(app)
      .post(`/api/inventory/${pharmacy._id}/bulk`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ items: [{ medicineName: 'Paracetamol 650mg', stockQty: 5, price: 5 }] });
    expect(res.status).toBe(403);
  });
});

describe('Concurrent inventory writes (race condition check)', () => {
  it('handles two simultaneous updates to the same stock entry without crashing or corrupting data', async () => {
    const { token, userId } = await createPharmacyOwner();
    const pharmacy = await createPharmacy(userId);
    const medicine = await createMedicine('Amoxicillin 500mg', 'Amoxicillin');

    // Fire two concurrent PUTs to the same pharmacy+medicine with different values
    const [resA, resB] = await Promise.all([
      request(app)
        .put(`/api/inventory/${pharmacy._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ medicineId: medicine._id, stockQty: 30, price: 10 }),
      request(app)
        .put(`/api/inventory/${pharmacy._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ medicineId: medicine._id, stockQty: 70, price: 12 })
    ]);

    // Both requests should succeed at the HTTP level (Mongo upsert serializes internally)
    expect([resA.status, resB.status]).toEqual([200, 200]);

    // Exactly one Inventory document should exist — no duplicate created by the race
    const entries = await Inventory.find({ pharmacyId: pharmacy._id, medicineId: medicine._id });
    expect(entries.length).toBe(1);

    // Final state should match one of the two writes (last-write-wins), not a corrupted mix
    expect([30, 70]).toContain(entries[0].stockQty);
  });
});