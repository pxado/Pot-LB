import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginRateLimiter } from '../src/rate-limit.mjs';

test('login limiter blocks repeated failures and resets account state on success', () => {
  let current = 1_000;
  const limiter = createLoginRateLimiter({
    enabled: true,
    maxFailures: 3,
    windowMs: 60_000,
    blockMs: 30_000,
    now: () => current
  });

  assert.equal(limiter.check('203.0.113.5', 'FOX-1001').allowed, true);
  limiter.recordFailure('203.0.113.5', 'FOX-1001');
  limiter.recordFailure('203.0.113.5', 'FOX-1001');
  limiter.recordFailure('203.0.113.5', 'FOX-1001');
  assert.equal(limiter.check('203.0.113.5', 'FOX-1001').allowed, false);

  current += 31_000;
  assert.equal(limiter.check('203.0.113.5', 'FOX-1001').allowed, true);
  limiter.recordSuccess('203.0.113.5', 'FOX-1001');
});
