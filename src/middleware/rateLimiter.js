const rateLimit = require('express-rate-limit');

function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message }
  });
}

// Jest sets NODE_ENV=test automatically. In real environments (local dev,
// Render) these are the actual enforced production limits: 20 auth attempts
// and 300 general API requests per 15 minutes per IP. Under test, the
// limits are relaxed way up by default, since a single integration test
// FILE can legitimately create dozens of fixture accounts (register+login
// pairs) while testing unrelated features -- the real enforcement logic
// itself is still fully covered by tests/unit/rateLimiter.test.js (which
// builds tiny, fast, isolated limiter instances directly) and by the
// wiring checks in tests/integration/rateLimiting.test.js.
const isTestEnv = process.env.NODE_ENV === 'test';

const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || (isTestEnv ? 2000 : 20);
const apiMax = Number(process.env.API_RATE_LIMIT_MAX) || (isTestEnv ? 5000 : 300);

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: authMax,
  message: 'Too many attempts. Please try again in a few minutes.'
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: apiMax,
  message: 'Too many requests. Please slow down.'
});

module.exports = { createRateLimiter, authLimiter, apiLimiter };