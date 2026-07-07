const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');
const Pharmacy = require('../../src/models/Pharmacy');
const Medicine = require('../../src/models/Medicine');
const Reservation = require('../../src/models/Reservation');

// Ordinary signup (goes through the real, now-hardened register endpoint).
// role can be 'user' or 'pharmacy' -- NOT 'admin', since register() now
// always downgrades a client-requested 'admin' role to 'user'.
async function createUser(email, role = 'user') {
  await request(app).post('/api/auth/register').send({ name: 'N', email, password: 'pass123', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  const user = await User.findOne({ email });
  return { token: loginRes.body.token, userId: user._id.toString() };
}

// Admins can ONLY be created by seeding the database directly (mirrors how
// the real first admin account is created directly in MongoDB Atlas) or by
// an existing admin using PUT /api/admin/users/:id/role -- never through
// the public register endpoint. This helper simulates "an admin already
// exists" for test setup purposes, then logs in through the real API so
// the returned token is a genuine, normally-issued JWT.
async function createAdminDirectly(email) {
  const passwordHash = await bcrypt.hash('pass123', 10);
  const admin = await User.create({ name: 'Admin', email, passwordHash, role: 'admin' });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
  return { token: loginRes.body.token, userId: admin._id.toString() };
}

describe('Admin route access control', () => {
  it('blocks every admin route for a non-admin role with 403', async () => {
    const { token: userToken } = await createUser('notadmin@test.com', 'user');
    const { token: pharmacyToken } = await createUser('notadmin2@test.com', 'pharmacy');

    for (const token of [userToken, pharmacyToken]) {
      const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('blocks unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('allows a real admin-role token through', async () => {
    const { token } = await createAdminDirectly('realadmin@test.com');
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET/PUT /api/admin/users', () => {
  it('filters users by role', async () => {
    const { token: adminToken } = await createAdminDirectly('admin1@test.com');
    await createUser('shopper1@test.com', 'user');
    await createUser('pharmowner1@test.com', 'pharmacy');

    const res = await request(app).get('/api/admin/users?role=pharmacy').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((u) => u.role === 'pharmacy')).toBe(true);
    expect(res.body.some((u) => u.email === 'pharmowner1@test.com')).toBe(true);
  });

  it('never leaks passwordHash in the user list', async () => {
    const { token: adminToken } = await createAdminDirectly('admin2@test.com');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.every((u) => u.passwordHash === undefined)).toBe(true);
  });

  it('can disable a user account', async () => {
    const { token: adminToken } = await createAdminDirectly('admin3@test.com');
    const { userId: targetId } = await createUser('tobedisabled@test.com', 'user');

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'tobedisabled@test.com', password: 'pass123' });
    expect(loginRes.status).toBe(403);
  });

  it('rejects a non-boolean isActive with 400', async () => {
    const { token: adminToken } = await createAdminDirectly('admin4@test.com');
    const { userId: targetId } = await createUser('badstatus@test.com', 'user');
    const res = await request(app)
      .put(`/api/admin/users/${targetId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: 'yes' });
    expect(res.status).toBe(400);
  });
});

describe('GET/PUT /api/admin/pharmacies', () => {
  it('filters pharmacies by verified status', async () => {
    const { token: adminToken, userId: ownerId } = await createAdminDirectly('admin5@test.com');
    await Pharmacy.create({ ownerUserId: ownerId, name: 'Verified P', address: 'A', latitude: 1, longitude: 1, verified: true });
    await Pharmacy.create({ ownerUserId: ownerId, name: 'Unverified P', address: 'A', latitude: 1, longitude: 1, verified: false });

    const res = await request(app).get('/api/admin/pharmacies?verified=true').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.every((p) => p.verified === true)).toBe(true);
    expect(res.body.some((p) => p.name === 'Verified P')).toBe(true);
    expect(res.body.some((p) => p.name === 'Unverified P')).toBe(false);
  });

  it('can verify a pharmacy', async () => {
    const { token: adminToken, userId: ownerId } = await createAdminDirectly('admin6@test.com');
    const pharmacy = await Pharmacy.create({ ownerUserId: ownerId, name: 'Pending P', address: 'A', latitude: 1, longitude: 1, verified: false });

    const res = await request(app)
      .put(`/api/admin/pharmacies/${pharmacy._id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: true });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });
});

describe('GET/PUT /api/admin/medicines', () => {
  it('searches medicines by name (case-insensitive) with pagination', async () => {
    const { token: adminToken } = await createAdminDirectly('admin7@test.com');
    await Medicine.create({ name: 'Paracetamol 650mg' });
    await Medicine.create({ name: 'Ibuprofen 400mg' });

    const res = await request(app).get('/api/admin/medicines?name=paracet').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.medicines.length).toBe(1);
    expect(res.body.medicines[0].name).toBe('Paracetamol 650mg');
    expect(res.body.total).toBe(1);
  });

  it('can update medicine details, including alternatives', async () => {
    const { token: adminToken } = await createAdminDirectly('admin8@test.com');
    const medicine = await Medicine.create({ name: 'Crocin 650mg', genericName: 'Paracetamol' });

    const res = await request(app)
      .put(`/api/admin/medicines/${medicine._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ alternatives: ['Paracetamol 650mg', 'Dolo 650'] });

    expect(res.status).toBe(200);
    expect(res.body.alternatives).toEqual(['Paracetamol 650mg', 'Dolo 650']);
  });
});

describe('GET /api/admin/stats', () => {
  it('returns accurate counts across the platform', async () => {
    const { token: adminToken, userId: ownerId } = await createAdminDirectly('admin9@test.com');
    await createUser('statuser1@test.com', 'user');
    await createUser('statpharm1@test.com', 'pharmacy');

    const pharmacy = await Pharmacy.create({ ownerUserId: ownerId, name: 'P', address: 'A', latitude: 1, longitude: 1, verified: true });
    const medicine = await Medicine.create({ name: 'M' });
    await Reservation.create({ userId: ownerId, pharmacyId: pharmacy._id, medicineId: medicine._id, status: 'pending' });
    await Reservation.create({ userId: ownerId, pharmacyId: pharmacy._id, medicineId: medicine._id, status: 'confirmed' });

    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pharmacies.total).toBe(1);
    expect(res.body.pharmacies.verified).toBe(1);
    expect(res.body.reservations.pending).toBe(1);
    expect(res.body.reservations.confirmed).toBe(1);
  });
});

describe('SECURITY: self-registration can no longer grant admin', () => {
  it('silently downgrades a requested "admin" role to "user" at signup', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Self-Made Admin', email: 'selfmadeadmin@test.com', password: 'pass123', role: 'admin'
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user'); // downgraded, not honored

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'selfmadeadmin@test.com', password: 'pass123' });
    const adminAccessRes = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(adminAccessRes.status).toBe(403); // no admin access
  });

  it('still allows the legitimate pharmacy-owner self-signup flow', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Pharmacy Owner', email: 'legitpharmacy@test.com', password: 'pass123', role: 'pharmacy'
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('pharmacy');
  });

  it('defaults to "user" when no role is sent at all', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Default Role', email: 'defaultrole@test.com', password: 'pass123'
    });
    expect(res.body.role).toBe('user');
  });
});

describe('PUT /api/admin/users/:id/role (admin promotion)', () => {
  it('allows an admin to promote a user to admin', async () => {
    const { token: adminToken } = await createAdminDirectly('promoter@test.com');
    const { userId: targetId } = await createUser('tobepromoted@test.com', 'user');

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'tobepromoted@test.com', password: 'pass123' });
    const adminAccessRes = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(adminAccessRes.status).toBe(200);
  });

  it('rejects an invalid role value with 400', async () => {
    const { token: adminToken } = await createAdminDirectly('promoter2@test.com');
    const { userId: targetId } = await createUser('badrole@test.com', 'user');
    const res = await request(app)
      .put(`/api/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('refuses to demote the last remaining admin (avoids lockout)', async () => {
    const { token: adminToken, userId: adminId } = await createAdminDirectly('onlyadmin@test.com');
    const res = await request(app)
      .put(`/api/admin/users/${adminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(res.status).toBe(409);
  });

  it('blocks a non-admin from calling this route', async () => {
    const { token: userToken } = await createUser('sneakypromoter@test.com', 'user');
    const { userId: targetId } = await createUser('target@test.com', 'user');
    const res = await request(app)
      .put(`/api/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });
});