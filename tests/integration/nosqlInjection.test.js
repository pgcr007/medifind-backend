const request = require('supertest');
const app = require('../../app');
const User = require('../../src/models/User');

describe('SECURITY: rejects non-string email/password on login (NoSQL injection attempt)', () => {
  it('rejects a MongoDB query-operator object passed as email', async () => {
    await User.create({ name: 'Victim', email: 'victim@test.com', passwordHash: 'irrelevant-hash', role: 'admin' });

    // Classic NoSQL injection attempt: if `email` were passed straight into
    // findOne({ email }) uncast, { "$gt": "" } would match any/every user.
    const res = await request(app).post('/api/auth/login').send({
      email: { $gt: '' },
      password: 'anything'
    });

    expect(res.status).toBe(400);
  });

  it('rejects a query-operator object passed as password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'someone@test.com',
      password: { $ne: null }
    });
    expect(res.status).toBe(400);
  });

  it('rejects an array passed as email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: ['victim@test.com', 'other@test.com'],
      password: 'x'
    });
    expect(res.status).toBe(400);
  });
});

describe('SECURITY: rejects non-string fields on register', () => {
  it('rejects a query-operator object passed as email at signup', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Attacker',
      email: { $gt: '' },
      password: 'pass123'
    });
    expect(res.status).toBe(400);

    // Confirm no user was actually created from this malformed input
    const count = await User.countDocuments();
    expect(count).toBe(0);
  });
});