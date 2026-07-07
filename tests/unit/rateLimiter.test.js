const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../../src/middleware/rateLimiter');

describe('createRateLimiter', () => {
  it('allows requests under the limit and blocks once exceeded', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max: 3, message: 'slow down' }));
    app.get('/ping', (req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    }

    const blockedRes = await request(app).get('/ping');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toBe('slow down');
  });

  it('tracks separate limiter instances independently', async () => {
    const app = express();
    app.use('/strict', createRateLimiter({ windowMs: 60_000, max: 1, message: 'strict limit' }));
    app.use('/loose', createRateLimiter({ windowMs: 60_000, max: 5, message: 'loose limit' }));
    app.get('/strict/ping', (req, res) => res.json({ ok: true }));
    app.get('/loose/ping', (req, res) => res.json({ ok: true }));

    await request(app).get('/strict/ping'); // uses up the only allowed request
    const strictBlocked = await request(app).get('/strict/ping');
    expect(strictBlocked.status).toBe(429);

    // A separate limiter instance has its own counter, unaffected by the one above
    const looseRes = await request(app).get('/loose/ping');
    expect(looseRes.status).toBe(200);
  });

  it('includes standard RateLimit-* response headers', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max: 5, message: 'x' }));
    app.get('/ping', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/ping');
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});