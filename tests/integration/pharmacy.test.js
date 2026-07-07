const request = require('supertest');
const app = require('../../app');
const Pharmacy = require('../../src/models/Pharmacy');
const Medicine = require('../../src/models/Medicine');
const Inventory = require('../../src/models/Inventory');
const User = require('../../src/models/User');

async function createPharmacyOwner(email = 'owner@test.com') {
  await request(app).post('/api/auth/register').send({
    name: 'Owner', email, password: 'pass123', role: 'pharmacy'
  });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return loginRes.body.token;
}

describe('POST /api/pharmacies (create)', () => {
  it('creates a pharmacy owned by the logged-in pharmacy user', async () => {
    const token = await createPharmacyOwner();
    const res = await request(app)
      .post('/api/pharmacies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'City Pharmacy', address: '1 Main St', latitude: 19.24, longitude: 73.13 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('City Pharmacy');
    expect(res.body.verified).toBe(false); // default, admin must verify
  });

  it('rejects a plain "user" role with 403', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Shopper', email: 'shopper@test.com', password: 'pass123'
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'shopper@test.com', password: 'pass123' });

    const res = await request(app)
      .post('/api/pharmacies')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ name: 'X', address: 'Y', latitude: 1, longitude: 1 });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/pharmacies/:id (update)', () => {
  it('allows the owner to update their pharmacy', async () => {
    const token = await createPharmacyOwner();
    const createRes = await request(app)
      .post('/api/pharmacies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Old Name', address: 'Addr', latitude: 1, longitude: 1 });

    const res = await request(app)
      .put(`/api/pharmacies/${createRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', is24Hours: true });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.is24Hours).toBe(true);
  });

  it('rejects a non-owner with 403', async () => {
    const ownerToken = await createPharmacyOwner('realowner@test.com');
    const createRes = await request(app)
      .post('/api/pharmacies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owned', address: 'Addr', latitude: 1, longitude: 1 });

    const otherToken = await createPharmacyOwner('otherowner@test.com');
    const res = await request(app)
      .put(`/api/pharmacies/${createRes.body._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/pharmacies/nearby', () => {
  async function seedPharmacies() {
    const token = await createPharmacyOwner();
    // Close, verified, 24-hour
    const owner = await User.findOne({ email: 'owner@test.com' });
    const closeP = await Pharmacy.create({
      ownerUserId: owner._id,
      name: 'Close Pharmacy', address: 'A', latitude: 19.2403, longitude: 73.1305,
      verified: true, is24Hours: true
    });
    // Far, verified, not 24-hour
    const farP = await Pharmacy.create({
      ownerUserId: closeP.ownerUserId,
      name: 'Far Pharmacy', address: 'B', latitude: 28.6139, longitude: 77.2090, // Delhi
      verified: true, is24Hours: false
    });
    // Close but NOT verified — should never appear
    const unverifiedP = await Pharmacy.create({
      ownerUserId: closeP.ownerUserId,
      name: 'Unverified Pharmacy', address: 'C', latitude: 19.24, longitude: 73.13,
      verified: false
    });
    return { closeP, farP, unverifiedP };
  }

  it('excludes unverified pharmacies', async () => {
    await seedPharmacies();
    const res = await request(app).get('/api/pharmacies/nearby?lat=19.2403&lng=73.1305');
    expect(res.status).toBe(200);
    const names = res.body.map((p) => p.name);
    expect(names).not.toContain('Unverified Pharmacy');
  });

  it('sorts results by distance, closest first', async () => {
    await seedPharmacies();
    const res = await request(app).get('/api/pharmacies/nearby?lat=19.2403&lng=73.1305');
    expect(res.body[0].name).toBe('Close Pharmacy');
    expect(res.body[res.body.length - 1].name).toBe('Far Pharmacy');
  });

  it('filters to only pharmacies with stock when medicineId is given', async () => {
    const { closeP, farP } = await seedPharmacies();
    const medicine = await Medicine.create({ name: 'Paracetamol 650mg', genericName: 'Paracetamol' });
    await Inventory.create({ pharmacyId: farP._id, medicineId: medicine._id, stockQty: 10, price: 20 });
    // closeP has no inventory entry for this medicine at all

    const res = await request(app).get(`/api/pharmacies/nearby?lat=19.2403&lng=73.1305&medicineId=${medicine._id}`);
    const names = res.body.map((p) => p.name);
    expect(names).toEqual(['Far Pharmacy']);
    expect(names).not.toContain('Close Pharmacy');
  });

  it('filters to only 24-hour pharmacies when emergencyOnly=true', async () => {
    await seedPharmacies();
    const res = await request(app).get('/api/pharmacies/nearby?lat=19.2403&lng=73.1305&emergencyOnly=true');
    const names = res.body.map((p) => p.name);
    expect(names).toEqual(['Close Pharmacy']);
  });

  it('rejects requests missing lat/lng with 400', async () => {
    const res = await request(app).get('/api/pharmacies/nearby');
    expect(res.status).toBe(400);
  });
});