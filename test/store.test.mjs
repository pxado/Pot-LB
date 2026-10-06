import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmployeeId } from '../src/db.mjs';

test('employee IDs are normalized for consistent PostgreSQL lookup', () => {
  assert.equal(normalizeEmployeeId(' fox-1001 '), 'FOX-1001');
  assert.equal(normalizeEmployeeId('A12'), 'A12');
});

test('invalid employee IDs are rejected', () => {
  assert.throws(() => normalizeEmployeeId('a'), /3-32 characters/);
  assert.throws(() => normalizeEmployeeId('EMP 1001'), /3-32 characters/);
});
