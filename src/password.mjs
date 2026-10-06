import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must be at least 12 characters long');
  }
  if (password.length > 256) {
    throw new Error('Password must not exceed 256 characters');
  }
}

export function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `${ALGORITHM}$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algorithm, n, r, p, saltText, hashText] = String(stored).split('$');
    if (algorithm !== ALGORITHM) return false;
    const expected = Buffer.from(hashText, 'base64url');
    const actual = scryptSync(String(password ?? ''), Buffer.from(saltText, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
