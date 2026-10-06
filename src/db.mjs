import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { ROLE_DEFINITIONS, roleExists } from './permissions.mjs';

const { Pool } = pg;
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

function normalizeDepartment(value, role) {
  if (role === 'administrator') return null;
  return cleanText(value, 'Department');
}

async function initialize(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGSERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      department TEXT,
      role TEXT NOT NULL CHECK (role IN (${roleValues})),
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    ALTER TABLE employees ALTER COLUMN department DROP NOT NULL;

    UPDATE employees SET department = NULL WHERE role = 'administrator' AND department IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_id_upper
      ON employees (UPPER(employee_id));

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      employee_pk BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_employee_pk BIGINT REFERENCES employees(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_employee_pk BIGINT REFERENCES employees(id) ON DELETE SET NULL,
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_events (
      id BIGSERIAL PRIMARY KEY,
      employee_id_input TEXT NOT NULL,
      employee_pk BIGINT REFERENCES employees(id) ON DELETE SET NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'rate_limited')),
      client_ip TEXT,
      socket_ip TEXT,
      device_id TEXT,
      user_agent TEXT,
      railway_edge TEXT,
      request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_pk);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_events_employee ON auth_events(employee_pk);
  `);
}

export async function openDatabase(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  await pool.query('SELECT 1');
  await initialize(pool);
  return createStore(pool);
}

function createStore(pool) {
  const employeeSelect = `
    SELECT id, employee_id, full_name, department, role, active, must_change_password,
           created_at, updated_at, last_login_at
    FROM employees`;

  return {
    async close() {
      await pool.end();
    },

    async getEmployeeWithPassword(employeeId) {
      const id = normalizeEmployeeId(employeeId);
      const { rows } = await pool.query('SELECT * FROM employees WHERE UPPER(employee_id) = $1 LIMIT 1', [id]);
      return rows[0] ?? null;
    },

    async getEmployeeByPk(id) {
      const { rows } = await pool.query(`${employeeSelect} WHERE id = $1`, [Number(id)]);
      return rows[0] ?? null;
    },

    async listEmployees() {
      const { rows } = await pool.query(`${employeeSelect} ORDER BY full_name, employee_id`);
      return rows;
    },

    async listDirectory() {
      const { rows } = await pool.query(`
        SELECT full_name, department, role
        FROM employees
        WHERE active = TRUE
        ORDER BY full_name, employee_id
      `);
      return rows;
    },

    async createEmployee({ employeeId, fullName, department, role, passwordHash, mustChangePassword = true }) {
      if (!roleExists(role)) throw new Error('Invalid role');
      const { rows } = await pool.query(`
        INSERT INTO employees (employee_id, full_name, department, role, password_hash, active, must_change_password)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        RETURNING id
      `, [
        normalizeEmployeeId(employeeId),
        cleanText(fullName, 'Full name'),
        normalizeDepartment(department, role),
        role,
        passwordHash,
        Boolean(mustChangePassword)
      ]);
      return this.getEmployeeByPk(rows[0].id);
    },

    async updateEmployee(id, changes) {
      const current = await this.getEmployeeByPk(id);
      if (!current) return null;
      const employeeId = changes.employeeId === undefined ? current.employee_id : normalizeEmployeeId(changes.employeeId);
      const fullName = changes.fullName === undefined ? current.full_name : cleanText(changes.fullName, 'Full name');
      const role = changes.role === undefined ? current.role : changes.role;
      if (!roleExists(role)) throw new Error('Invalid role');
      const departmentSource = changes.department === undefined ? current.department : changes.department;
      const department = normalizeDepartment(departmentSource, role);
      const active = changes.active === undefined ? current.active : Boolean(changes.active);
      await pool.query(`
        UPDATE employees
        SET employee_id = $1, full_name = $2, department = $3, role = $4, active = $5, updated_at = NOW()
        WHERE id = $6
      `, [employeeId, fullName, department, role, active, Number(id)]);
      return this.getEmployeeByPk(id);
    },

    async setPassword(id, passwordHash, mustChangePassword = true) {
      const result = await pool.query(`
        UPDATE employees
        SET password_hash = $1, must_change_password = $2, updated_at = NOW()
        WHERE id = $3
      `, [passwordHash, Boolean(mustChangePassword), Number(id)]);
      return result.rowCount > 0;
    },

    async markLogin(id) {
      await pool.query('UPDATE employees SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [Number(id)]);
    },

    async countEmployees() {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM employees');
      return rows[0].count;
    },

    async countActiveEmployees() {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM employees WHERE active = TRUE');
      return rows[0].count;
    },

    async countDepartments() {
      const { rows } = await pool.query('SELECT COUNT(DISTINCT department)::int AS count FROM employees WHERE active = TRUE AND department IS NOT NULL');
      return rows[0].count;
    },

    async countActiveAdmins() {
      const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM employees WHERE active = TRUE AND role = 'administrator'");
      return rows[0].count;
    },

    async createSession(employeePk, ttlMs) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const csrfToken = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlMs);
      await pool.query(`
        INSERT INTO sessions (token_hash, employee_pk, csrf_token, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [tokenHash, Number(employeePk), csrfToken, expiresAt]);
      return { token, csrfToken, expiresAt: expiresAt.toISOString() };
    },

    async getSession(token) {
      const tokenHash = createHash('sha256').update(String(token ?? '')).digest('hex');
      const { rows } = await pool.query(`
        SELECT s.token_hash, s.csrf_token, s.expires_at,
               e.id, e.employee_id, e.full_name, e.department, e.role, e.active,
               e.must_change_password, e.last_login_at
        FROM sessions s
        JOIN employees e ON e.id = s.employee_pk
        WHERE s.token_hash = $1 AND s.expires_at > NOW() AND e.active = TRUE
        LIMIT 1
      `, [tokenHash]);
      return rows[0] ?? null;
    },

    async deleteSession(token) {
      const tokenHash = createHash('sha256').update(String(token ?? '')).digest('hex');
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },

    async deleteSessionsForEmployee(employeePk) {
      await pool.query('DELETE FROM sessions WHERE employee_pk = $1', [Number(employeePk)]);
    },

    async purgeExpiredSessions() {
      await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
    },

    async addAuthEvent({
      employeeIdInput,
      employeePk = null,
      outcome,
      clientIp = null,
      socketIp = null,
      deviceId = null,
      userAgent = null,
      railwayEdge = null,
      requestId = null
    }) {
      await pool.query(`
        INSERT INTO auth_events (
          employee_id_input, employee_pk, outcome, client_ip, socket_ip,
          device_id, user_agent, railway_edge, request_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        String(employeeIdInput ?? '').trim().slice(0, 64) || 'unknown',
        employeePk === null ? null : Number(employeePk),
        outcome,
        clientIp,
        socketIp,
        deviceId,
        userAgent,
        railwayEdge,
        requestId
      ]);
    },

    async listAuthEvents(limit = 50) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const { rows } = await pool.query(`
        SELECT id, employee_id_input, outcome, client_ip, socket_ip, device_id,
               user_agent, railway_edge, request_id, created_at
        FROM auth_events
        ORDER BY id DESC
        LIMIT $1
      `, [safeLimit]);
      return rows;
    },

    async addAudit({ actorEmployeePk = null, action, targetEmployeePk = null, details = {} }) {
      await pool.query(`
        INSERT INTO audit_logs (actor_employee_pk, action, target_employee_pk, details_json)
        VALUES ($1, $2, $3, $4::jsonb)
      `, [
        actorEmployeePk === null ? null : Number(actorEmployeePk),
        cleanText(action, 'Action', 80),
        targetEmployeePk === null ? null : Number(targetEmployeePk),
        JSON.stringify(details)
      ]);
    },

    async listAudit(limit = 30) {
      const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const { rows } = await pool.query(`
        SELECT a.id, a.action, a.details_json AS details, a.created_at,
               actor.employee_id AS actor_employee_id, actor.full_name AS actor_name,
               target.employee_id AS target_employee_id, target.full_name AS target_name
        FROM audit_logs a
        LEFT JOIN employees actor ON actor.id = a.actor_employee_pk
        LEFT JOIN employees target ON target.id = a.target_employee_pk
        ORDER BY a.id DESC
        LIMIT $1
      `, [safeLimit]);
      return rows;
    }
  };
}
