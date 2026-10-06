# Fox Workplace

Internal employee management and organization portal for Fox Pvt. Ltd.

Fox Workplace is designed as an internal system rather than a public company website. Employees sign in with organization-issued credentials and receive role-based access to self-service and work areas.

## Current scope

- Internal Workplace gateway and employee sign-in.
- Employee profile and role-based home.
- Authenticated people directory.
- Self-service areas for requests, attendance/leave, documents, and organization resources.
- Role work areas for management, operations, robotics, quality, and support.
- Administrator console for employee creation, role assignment, activation/deactivation, and password reset.
- Department-less organization-level administrator accounts.
- PostgreSQL persistence for employee accounts, password hashes, sessions, and audit events.
- No seeded users and no hardcoded credentials.

## Access model

Administrators are organization-level accounts and are not assigned to a department.

Non-administrator employees require a department and receive Workplace services according to their assigned role.

## Requirements

- Node.js 22.5 or newer.
- PostgreSQL 14 or newer.

## Environment

Copy `.env.example` to `.env` for local development and set a valid PostgreSQL connection string in `DATABASE_URL`.

The application creates and migrates its required tables and indexes automatically when it starts.

## Start locally

```bash
npm install
node --env-file=.env src/server.mjs
```

Open `http://127.0.0.1:3000` unless you changed `HOST` or `PORT`.

## First administrator

Set:

```text
FOX_BOOTSTRAP_EMPLOYEE_ID
FOX_BOOTSTRAP_NAME
FOX_BOOTSTRAP_PASSWORD
```

Then run:

```bash
node --env-file=.env src/bootstrap-admin.mjs
```

In production the server can also create the first administrator from the same environment variables when no active administrator exists. Administrator accounts are created without a department.

## Railway deployment

Production expects:

- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `DATABASE_URL` referencing the Railway PostgreSQL service.

Railway supplies `PORT` automatically. The application exposes `/api/health` for health checks.

## Test

```bash
npm test
```

## Repository layout

```text
public/   Workplace UI and Fox brand asset
src/      HTTP server, PostgreSQL persistence, authentication, and RBAC
test/     Node test suite
```

## Authentication audit data

Authentication events are recorded in PostgreSQL and written as line-oriented JSON to `runtime-logs/auth.log`. HTTP access records are written to `runtime-logs/access.log`. The records include the client IP supplied by the hosting edge, socket IP, browser identifier when available, user agent, request ID, edge location, result, and timestamp. Passwords and request bodies are not logged.

The log files are suitable for collection by standard file-based logging agents such as rsyslog `imfile`.

For isolated local testing, `AUTH_RATE_LIMIT_ENABLED=false` is accepted only when the application is bound to a loopback host and is not running in production mode. Non-loopback and production deployments enforce the server-side authentication rate policy.
