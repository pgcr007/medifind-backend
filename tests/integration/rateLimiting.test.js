const request = require('supertest');
const app = require('../../app');

// The real 20-per-15-min enforcement logic is exercised directly and
// deterministically in tests/unit/rateLimiter.test.js using small, fast,
// isolated limiter instances. These integration tests only confirm the
// real app actually has rate limiting AND helmet wired in correctly --
// they don't try to exhaust the real (relaxed-for-test) limit, since doing
// that here would require mutating process.env in a way that could leak
// into other test files under `jest --runInBand`.

describe('Rate limiting is wired into the real app', () => {
  it('includes RateLimit-* headers on auth routes', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrong' });
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('includes RateLimit-* headers on other API routes', async () => {
    const res = await request(app).get('/api/medicines');
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('does NOT rate-limit /health (needed for free-tier uptime pings)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    }
  });
});

describe('Security headers (helmet)', () => {
  it('sets standard protective headers on responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined(); // helmet strips this by default
  });
});