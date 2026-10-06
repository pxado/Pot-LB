import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.mjs';
import { hashPassword } from '../src/password.mjs';

test('employee, session, and audit lifecycle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-store-'));
  const store = openDatabase(path.join(dir, 'test.db'));
  try {
    const admin = store.createEmployee({
      employeeId: 'FOX-1001',
      fullName: 'Test Administrator',
      department: 'Administration',
      role: 'administrator',
      passwordHash: hashPassword('temporary-admin-password'),
      mustChangePassword: false
    });
    assert.equal(store.countEmployees(), 1);
    assert.equal(store.countActiveAdmins(), 1);

    const session = store.createSession(admin.id, 60_000);
    const loaded = store.getSession(session.token);
    assert.equal(loaded.employee_id, 'FOX-1001');
    assert.equal(loaded.role, 'administrator');

    store.addAudit({ actorEmployeePk: admin.id, action: 'test_event', targetEmployeePk: admin.id });
    assert.equal(store.listAudit(10)[0].action, 'test_event');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
