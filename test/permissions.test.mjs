import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, modulesForRole, roleExists } from '../src/permissions.mjs';

test('roles expose expected administrative and employee boundaries', () => {
  assert.equal(roleExists('administrator'), true);
  assert.equal(roleExists('unknown'), false);
  assert.equal(hasPermission('administrator', '*'), true);
  assert.equal(hasPermission('employee', '*'), false);
  assert.deepEqual(
    modulesForRole('employee'),
    ['overview', 'people', 'requests', 'attendance', 'documents']
  );
});
