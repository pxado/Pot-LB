import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ROLE_DEFINITIONS, roleExists } from './permissions.mjs';

const nowIso = () => new Date().toISOString();
const roleValues = ROLE_DEFINITIONS.map((role) => `'${role.key}'`).join(',');

export function normalizeEmployeeId(value) {
  const employeeId = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(employeeId)) {
    throw new Error('Employee ID must be 3-32 characters using letters, numbers, or hyphens');
  }
  return employeeId;
}

function cleanText(value, field, max = 100) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > max) throw new Error(`${field} is required and must be at most ${max} characters`);
  return text;
}

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN (${roleValues})),
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      employee_pk INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_employee_pk INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_employee_pk INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_pk);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);
  return createStore(db);
}

function createStore(db) {
  const employeeSelect = `
    SELECT id, employee_id, full_name, department, role, active, must_change_password,
           created_at, updated_at, last_login_at
    FROM employees`;

  return {
    close() {
      db.close();
    },

    getEmployeeWithPassword(employeeId) {
      return db.prepare(`SELECT * FROM employees WHERE employee_id = ? COLLATE NOCASE`).get(normalizeEmployeeId(employeeId)) ?? null;
    },

    getEmployeeByPk(id) {
      return db.prepare(`${employeeSelect} WHERE id = ?`).get(Number(id)) ?? null;
    },

    listEmployees() {
      return db.prepare(`${employeeSelect} ORDER BY full_name COLLATE NOCASE, employee_id`).all();
    },

    createEmployee({ employeeId, fullName, department, role, passwordHash, mustChangePassword = true }) {
      if (!roleExists(role)) throw new Error('Invalid role');
      const createdAt = nowIso();
      const result = db.prepare(`
        INSERT INTO employees (employee_id, full_name, department, role, password_hash, active, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        normalizeEmployeeId(employeeId),
        cleanText(fullName, 'Full name'),
        cleanText(department, 'Department'),
        role,
        passwordHash,
        mustChangePassword ? 1 : 0,
        createdAt,
        createdAt
      );
      return this.getEmployeeByPk(result.lastInsertRowid);
    },

    updateEmployee(id, changes) {
      const current = this.getEmployeeByPk(id);
      if (!current) return null;
      const employeeId = changes.employeeId === undefined ? current.employee_id : normalizeEmployeeId(changes.employeeId);
      const fullName = changes.fullName === undefined ? current.full_name : cleanText(changes.fullName, 'Full name');
      const department = changes.department === undefined ? current.department : cleanText(changes.department, 'Department');
      const role = changes.role === undefined ? current.role : changes.role;
      const active = changes.active === undefined ? current.active : (changes.active ? 1 : 0);
      if (!roleExists(role)) throw new Error('Invalid role');
      db.prepare(`
        UPDATE employees SET employee_id = ?, full_name = ?, department = ?, role = ?, active = ?, updated_at = ?
        WHERE id = ?
      `).run(employeeId, fullName, department, role, active, nowIso(), Number(id));
      return this.getEmployeeByPk(id);
    },

    setPassword(id, passwordHash, mustChangePassword = true) {
      const result = db.prepare(`
        UPDATE employees SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?
      `).run(passwordHash, mustChangePassword ? 1 : 0, nowIso(), Number(id));
      return result.changes > 0;
    },

    markLogin(id) {
      db.prepare(`UPDATE employees SET last_login_at = ?, updated_at = ? WHERE id = ?`).run(nowIso(), nowIso(), Number(id));
    },

    countEmployees() {
      return Number(db.prepare('SELECT COUNT(*) AS count FROM employees').get().count);
    },

    countActiveEmployees() {
      return Number(db.prepare('SELECT COUNT(*) AS count FROM employees WHERE active = 1').get().count);
    },

    countDepartments() {
      return Number(db.prepare(`SELECT COUNT(DISTINCT department) AS count FROM employees WHERE active = 1`).get().count);
    },

    countActiveAdmins() {
      return Number(db.prepare(`SELECT COUNT(*) AS count FROM employees WHERE active = 1 AND role = 'administrator'`).get().count);
    },

    createSession(employeePk, ttlMs) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const csrfToken = randomBytes(24).toString('base64url');
      const createdAt = nowIso();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      db.prepare(`
        INSERT INTO sessions (token_hash, employee_pk, csrf_token, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(tokenHash, Number(employeePk), csrfToken, expiresAt, createdAt);
      return { token, csrfToken, expiresAt };
    },

    getSession(token) {
      const tokenHash = createHash('sha256').update(String(token ?? '')).digest('hex');
      const row = db.prepare(`
        SELECT s.token_hash, s.csrf_token, s.expires_at,
               e.id, e.employee_id, e.full_name, e.department, e.role, e.active,
               e.must_change_password, e.last_login_at
        FROM sessions s
        JOIN employees e ON e.id = s.employee_pk
        WHERE s.token_hash = ? AND s.expires_at > ? AND e.active = 1
      `).get(tokenHash, nowIso());
      return row ?? null;
    },

    deleteSession(token) {
      const tokenHash = createHash('sha256').update(String(token ?? '')).digest('hex');
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },

    deleteSessionsForEmployee(employeePk) {
      db.prepare('DELETE FROM sessions WHERE employee_pk = ?').run(Number(employeePk));
    },

    purgeExpiredSessions() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
    },

    addAudit({ actorEmployeePk = null, action, targetEmployeePk = null, details = {} }) {
      db.prepare(`
        INSERT INTO audit_logs (actor_employee_pk, action, target_employee_pk, details_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(actorEmployeePk, cleanText(action, 'Action', 80), targetEmployeePk, JSON.stringify(details), nowIso());
    },

    listAudit(limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      return db.prepare(`
        SELECT a.id, a.action, a.details_json, a.created_at,
               actor.employee_id AS actor_employee_id, actor.full_name AS actor_name,
               target.employee_id AS target_employee_id, target.full_name AS target_name
        FROM audit_logs a
        LEFT JOIN employees actor ON actor.id = a.actor_employee_pk
        LEFT JOIN employees target ON target.id = a.target_employee_pk
        ORDER BY a.id DESC
        LIMIT ?
      `).all(safeLimit).map((row) => ({
        ...row,
        details: JSON.parse(row.details_json || '{}'),
        details_json: undefined
      }));
    }
  };
}
