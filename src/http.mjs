import fs from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon']
]);

export function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function text(res, status, value) {
  const body = String(value);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export async function readJson(req, maxBytes) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function setSecurityHeaders(res, production) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function setSessionCookie(res, name, token, ttlMs, production) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(ttlMs / 1000)}`
  ];
  if (production) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res, name, production) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (production) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const expected = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
  if (origin !== expected) throw Object.assign(new Error('Cross-origin request rejected'), { status: 403 });
}

export async function serveStatic(res, publicDir, requestedPath) {
  const routeMap = new Map([
    ['/', 'index.html'],
    ['/login', 'login.html'],
    ['/portal', 'portal.html'],
    ['/admin', 'admin.html']
  ]);
  const relative = routeMap.get(requestedPath) ?? requestedPath.replace(/^\//, '');
  if (!relative || relative.includes('\0')) return false;
  const root = path.resolve(publicDir);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) return false;
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return false;
    const body = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME_TYPES.get(ext) ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': isHtml ? 'no-store' : 'public, max-age=3600'
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
