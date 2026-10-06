import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/password.mjs';

test('password hashing stores no plaintext and verifies correctly', () => {
  const password = 'A-real-test-password-42';
  const stored = hashPassword(password);
  assert.equal(stored.includes(password), false);
  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword('wrong-password-value', stored), false);
});

test('password policy rejects short values', () => {
  assert.throws(() => hashPassword('short'), /at least 12 characters/);
});
