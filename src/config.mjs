function parsePort(value) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function required(name, value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

export const config = Object.freeze({
  host: process.env.HOST?.trim() || '127.0.0.1',
  port: parsePort(process.env.PORT),
  databaseUrl: required('DATABASE_URL', process.env.DATABASE_URL),
  production: process.env.NODE_ENV === 'production',
  sessionTtlMs: 8 * 60 * 60 * 1000,
  maxJsonBytes: 64 * 1024,
  cookieName: 'fox_session'
});
