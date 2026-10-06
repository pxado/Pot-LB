import path from 'node:path';

function parsePort(value) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export const config = Object.freeze({
  host: process.env.HOST?.trim() || '127.0.0.1',
  port: parsePort(process.env.PORT),
  databasePath: path.resolve(process.env.DATABASE_PATH?.trim() || './data/fox.db'),
  production: process.env.NODE_ENV === 'production',
  sessionTtlMs: 8 * 60 * 60 * 1000,
  maxJsonBytes: 64 * 1024,
  cookieName: 'fox_session'
});
