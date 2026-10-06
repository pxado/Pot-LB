import fs from 'node:fs';
import path from 'node:path';

function clean(value, max = 512) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/[\r\n\t]/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function requestContext(req) {
  const railwayIp = clean(req.headers['x-real-ip'], 96);
  const socketIp = clean(req.socket?.remoteAddress, 96);
  return {
    clientIp: railwayIp || socketIp || 'unknown',
    socketIp,
    deviceId: clean(req.headers['x-fox-device-id'], 128),
    userAgent: clean(req.headers['user-agent'], 768),
    railwayEdge: clean(req.headers['x-railway-edge'], 64),
    requestId: clean(req.headers['x-railway-request-id'], 128)
  };
}

export function createLocalLogger(logDir) {
  let accessStream = null;
  let authStream = null;

  try {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o750 });
    accessStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a', mode: 0o640 });
    authStream = fs.createWriteStream(path.join(logDir, 'auth.log'), { flags: 'a', mode: 0o640 });
  } catch (error) {
    console.error('Local log file initialization failed:', error.message);
  }

  function emit(stream, record) {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...record });
    if (stream?.writable) stream.write(`${line}\n`);
    process.stdout.write(`${line}\n`);
  }

  return {
    access(record) {
      emit(accessStream, { logType: 'access', ...record });
    },
    auth(record) {
      emit(authStream, { logType: 'authentication', ...record });
    },
    close() {
      accessStream?.end();
      authStream?.end();
    }
  };
}
