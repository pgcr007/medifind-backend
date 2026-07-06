const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');

describe('POST /api/auth/register', () => {
  it('creates a new user and returns 201 with no password in the response', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'newuser@test.com',
      password: 'pass123'
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newuser@test.com');
    expect(res.body.role).toBe('user'); // default role
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'A', email: 'dup@test.com', password: 'pass123'
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'B', email: 'dup@test.com', password: 'pass456'
    });
    expect(res.status).toBe(409);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });

  it('allows registering with an explicit role (pharmacy/admin)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Pharmacy Owner', email: 'pharm@test.com', password: 'pass123', role: 'pharmacy'
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('pharmacy');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login User', email: 'login@test.com', password: 'pass123'
    });
  });

  it('logs in with correct credentials and returns a JWT + user object', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'pass123'
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('login@test.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'wrongpass'
    });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with 401 (not 404 — avoids leaking which emails exist)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@test.com', password: 'pass123'
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for a disabled account with 403', async () => {
    await User.findOneAndUpdate({ email: 'login@test.com' }, { isActive: false });
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'pass123'
    });
    expect(res.status).toBe(403);
  });
});

describe('JWT validation on protected routes (GET /api/auth/me)', () => {
  async function registerAndLogin(email = 'me@test.com') {
    await request(app).post('/api/auth/register').send({
      name: 'Me User', email, password: 'pass123'
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
    return loginRes.body.token;
  }

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed/garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token missing the "Bearer " prefix', async () => {
    const token = await registerAndLogin('nobearer@test.com');
    const res = await request(app).get('/api/auth/me').set('Authorization', token);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const jwt = require('jsonwebtoken');
    const fakeToken = jwt.sign({ id: '123456789012', role: 'user' }, 'wrong-secret');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { id: '123456789012', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // already expired
    );
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and returns the profile without the password hash', async () => {
    const token = await registerAndLogin('valid@test.com');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('valid@test.com');
    expect(res.body.passwordHash).toBeUndefined();
  });
});