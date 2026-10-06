import http from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { openDatabase } from './db.mjs';
import { hashPassword, verifyPassword } from './password.mjs';
import { ROLE_DEFINITIONS, hasPermission, modulesForRole, roleExists } from './permissions.mjs';
import {
  clearSessionCookie,
  json,
  parseCookies,
  readJson,
  requireSameOrigin,
  serveStatic,
  setSecurityHeaders,
  setSessionCookie,
  text
} from './http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const store = await openDatabase(config.databaseUrl);
const dummyPasswordHash = hashPassword(randomBytes(24).toString('base64url'));

setInterval(async () => {
  try {
    await store.purgeExpiredSessions();
  } catch (error) {
    console.error('Failed to purge expired sessions:', error.message);
  }
}, 15 * 60 * 1000).unref();

function publicEmployee(row) {
  return {
    id: Number(row.id),
    employeeId: row.employee_id,
    fullName: row.full_name,
    department: row.department,
    role: row.role,
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

async function currentSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[config.cookieName];
  if (!token) return null;
  const session = await store.getSession(token);
  return session ? { ...session, token } : null;
}

async function requireAuth(req) {
  const session = await currentSession(req);
  if (!session) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return session;
}

async function requireAdmin(req) {
  const session = await requireAuth(req);
  if (!hasPermission(session.role, '*')) throw Object.assign(new Error('Administrator access required'), { status: 403 });
  if (session.must_change_password) throw Object.assign(new Error('Change your password before using administrative functions'), { status: 403 });
  return session;
}

function requireCsrf(req, session) {
  if (req.headers['x-csrf-token'] !== session.csrf_token) {
    throw Object.assign(new Error('Invalid CSRF token'), { status: 403 });
  }
}

function routeMatch(pathname, regex) {
  const match = pathname.match(regex);
  return match ? match.slice(1).map((value) => decodeURIComponent(value)) : null;
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'fox-organization-suite' });
  }

  if (req.method === 'GET' && pathname === '/api/meta/roles') {
    return json(res, 200, {
      roles: ROLE_DEFINITIONS.map(({ key, label, description }) => ({ key, label, description }))
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    requireSameOrigin(req);
    const body = await readJson(req, config.maxJsonBytes);
    const employeeId = String(body.employeeId ?? '').trim();
    const password = String(body.password ?? '');
    let employee = null;
    try {
      employee = await store.getEmployeeWithPassword(employeeId);
    } catch {
      employee = null;
    }
    const passwordOk = verifyPassword(password, employee?.password_hash ?? dummyPasswordHash);
    if (!employee || !employee.active || !passwordOk) {
      return json(res, 401, { error: 'Invalid employee ID or password' });
    }
    await store.deleteSessionsForEmployee(employee.id);
    const session = await store.createSession(employee.id, config.sessionTtlMs);
    await store.markLogin(employee.id);
    await store.addAudit({ actorEmployeePk: employee.id, action: 'login', targetEmployeePk: employee.id });
    setSessionCookie(res, config.cookieName, session.token, config.sessionTtlMs, config.production);
    return json(res, 200, {
      user: publicEmployee(await store.getEmployeeByPk(employee.id)),
      csrfToken: session.csrfToken
    });
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    const session = await requireAuth(req);
    return json(res, 200, {
      user: publicEmployee(session),
      csrfToken: session.csrf_token
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    requireSameOrigin(req);
    const session = await requireAuth(req);
    requireCsrf(req, session);
    await store.deleteSession(session.token);
    clearSessionCookie(res, config.cookieName, config.production);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/auth/change-password') {
    requireSameOrigin(req);
    const session = await requireAuth(req);
    requireCsrf(req, session);
    const body = await readJson(req, config.maxJsonBytes);
    const employee = await store.getEmployeeWithPassword(session.employee_id);
    if (!verifyPassword(String(body.currentPassword ?? ''), employee.password_hash)) {
      return json(res, 400, { error: 'Current password is incorrect' });
    }
    const nextHash = hashPassword(String(body.newPassword ?? ''));
    await store.setPassword(session.id, nextHash, false);
    await store.deleteSessionsForEmployee(session.id);
    await store.addAudit({ actorEmployeePk: session.id, action: 'password_changed', targetEmployeePk: session.id });
    clearSessionCookie(res, config.cookieName, config.production);
    return json(res, 200, { ok: true, reauthenticate: true });
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const session = await requireAuth(req);
    const roleModules = modulesForRole(session.role);
    const moduleCopy = {
      overview: { title: 'My Workspace', description: 'Profile, shift context, and organization access.' },
      people: { title: 'Team Coordination', description: 'Team collaboration and operational communication.' },
      operations: { title: 'Automation Operations', description: 'Assigned work, product lines, robotics floor, and device operations.' },
      quality: { title: 'Quality & AI Monitoring', description: 'Quality checks, anomaly review, and inspection workflows.' },
      support: { title: 'Service & Support', description: 'Service tickets, customer coordination, and support documentation.' },
      documents: { title: 'Documents & Training', description: 'SOPs, safety guidance, manuals, and training resources.' }
    };
    return json(res, 200, {
      user: publicEmployee(session),
      modules: roleModules.map((key) => ({ key, ...moduleCopy[key] })),
      assignments: [],
      announcements: []
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/overview') {
    await requireAdmin(req);
    const [employees, activeEmployees, departments, activeAdministrators] = await Promise.all([
      store.countEmployees(),
      store.countActiveEmployees(),
      store.countDepartments(),
      store.countActiveAdmins()
    ]);
    return json(res, 200, {
      totals: { employees, activeEmployees, departments, activeAdministrators }
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/employees') {
    await requireAdmin(req);
    return json(res, 200, { employees: (await store.listEmployees()).map(publicEmployee) });
  }

  if (req.method === 'POST' && pathname === '/api/admin/employees') {
    requireSameOrigin(req);
    const session = await requireAdmin(req);
    requireCsrf(req, session);
    const body = await readJson(req, config.maxJsonBytes);
    if (!roleExists(body.role)) return json(res, 400, { error: 'Invalid role' });
    const created = await store.createEmployee({
      employeeId: body.employeeId,
      fullName: body.fullName,
      department: body.department,
      role: body.role,
      passwordHash: hashPassword(String(body.password ?? '')),
      mustChangePassword: true
    });
    await store.addAudit({
      actorEmployeePk: session.id,
      action: 'employee_created',
      targetEmployeePk: created.id,
      details: { employeeId: created.employee_id, role: created.role }
    });
    return json(res, 201, { employee: publicEmployee(created) });
  }

  const employeeEdit = routeMatch(pathname, /^\/api\/admin\/employees\/(\d+)$/);
  if (employeeEdit && req.method === 'PATCH') {
    requireSameOrigin(req);
    const session = await requireAdmin(req);
    requireCsrf(req, session);
    const targetId = Number(employeeEdit[0]);
    const target = await store.getEmployeeByPk(targetId);
    if (!target) return json(res, 404, { error: 'Employee not found' });
    const body = await readJson(req, config.maxJsonBytes);

    if (targetId === Number(session.id) && (body.active === false || (body.role && body.role !== 'administrator'))) {
      return json(res, 400, { error: 'You cannot deactivate or remove your own administrator role' });
    }
    if (target.role === 'administrator' && (body.active === false || (body.role && body.role !== 'administrator')) && await store.countActiveAdmins() <= 1) {
      return json(res, 400, { error: 'At least one active administrator is required' });
    }
    if (body.role !== undefined && !roleExists(body.role)) return json(res, 400, { error: 'Invalid role' });

    const updated = await store.updateEmployee(targetId, body);
    if (body.active === false) await store.deleteSessionsForEmployee(targetId);
    await store.addAudit({
      actorEmployeePk: session.id,
      action: 'employee_updated',
      targetEmployeePk: targetId,
      details: {
        employeeId: updated.employee_id,
        role: updated.role,
        active: Boolean(updated.active)
      }
    });
    return json(res, 200, { employee: publicEmployee(updated) });
  }

  const resetPassword = routeMatch(pathname, /^\/api\/admin\/employees\/(\d+)\/reset-password$/);
  if (resetPassword && req.method === 'POST') {
    requireSameOrigin(req);
    const session = await requireAdmin(req);
    requireCsrf(req, session);
    const targetId = Number(resetPassword[0]);
    if (targetId === Number(session.id)) return json(res, 400, { error: 'Use Change Password for your own account' });
    const target = await store.getEmployeeByPk(targetId);
    if (!target) return json(res, 404, { error: 'Employee not found' });
    const body = await readJson(req, config.maxJsonBytes);
    await store.setPassword(targetId, hashPassword(String(body.password ?? '')), true);
    await store.deleteSessionsForEmployee(targetId);
    await store.addAudit({
      actorEmployeePk: session.id,
      action: 'password_reset',
      targetEmployeePk: targetId,
      details: { employeeId: target.employee_id }
    });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit') {
    await requireAdmin(req);
    return json(res, 200, { events: await store.listAudit(url.searchParams.get('limit') ?? 30) });
  }

  return json(res, 404, { error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res, config.production);
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    const served = await serveStatic(res, publicDir, url.pathname);
    if (!served) return text(res, 404, 'Not found');
  } catch (error) {
    const duplicateEmployee = error.code === '23505';
    const status = Number(error.status) || (duplicateEmployee ? 409 : 500);
    const message = duplicateEmployee ? 'Employee ID already exists' : (status >= 500 ? 'Internal server error' : error.message);
    if (status >= 500) console.error(error);
    if (!res.headersSent) return json(res, status, { error: message });
    res.end();
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => {
  console.log(`Fox organization suite listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
