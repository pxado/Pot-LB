export function createLoginRateLimiter({
  enabled = true,
  maxFailures = 8,
  windowMs = 60_000,
  blockMs = 60_000,
  now = () => Date.now()
} = {}) {
  const buckets = new Map();

  function normalizedKey(prefix, value) {
    const text = String(value ?? '').trim().toLowerCase();
    return text ? `${prefix}:${text}` : null;
  }

  function keys(clientIp, employeeId) {
    return [
      normalizedKey('ip', clientIp),
      normalizedKey('account', employeeId)
    ].filter(Boolean);
  }

  function compact(bucket, current) {
    bucket.failures = bucket.failures.filter((value) => current - value < windowMs);
    if (bucket.blockedUntil && bucket.blockedUntil <= current) bucket.blockedUntil = 0;
  }

  function getBucket(key) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { failures: [], blockedUntil: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  return {
    check(clientIp, employeeId) {
      if (!enabled) return { allowed: true, retryAfterSeconds: 0 };
      const current = now();
      let retryAfterMs = 0;

      for (const key of keys(clientIp, employeeId)) {
        const bucket = getBucket(key);
        compact(bucket, current);
        if (bucket.blockedUntil > current) {
          retryAfterMs = Math.max(retryAfterMs, bucket.blockedUntil - current);
        }
      }

      return {
        allowed: retryAfterMs === 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
      };
    },

    recordFailure(clientIp, employeeId) {
      if (!enabled) return;
      const current = now();
      for (const key of keys(clientIp, employeeId)) {
        const bucket = getBucket(key);
        compact(bucket, current);
        bucket.failures.push(current);
        if (bucket.failures.length >= maxFailures) {
          bucket.blockedUntil = current + blockMs;
        }
      }
    },

    recordSuccess(clientIp, employeeId) {
      if (!enabled) return;
      const accountKey = normalizedKey('account', employeeId);
      if (accountKey) buckets.delete(accountKey);
      const ipKey = normalizedKey('ip', clientIp);
      if (ipKey) {
        const bucket = buckets.get(ipKey);
        if (bucket) {
          compact(bucket, now());
          bucket.failures = bucket.failures.slice(-Math.max(0, maxFailures - 2));
        }
      }
    }
  };
}
