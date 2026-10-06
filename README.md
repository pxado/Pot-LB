# Fox Pvt. Ltd. Organization Suite

Organization portal for Fox Pvt. Ltd., a home-automation company focused on robotics, connected devices, and AI-assisted environments.

## Included

- Public corporate landing page with an original fox mark and home-automation positioning.
- Employee sign-in using Employee ID and password.
- Employee portal with role-aware workspace sections.
- Administrator console for employee creation, role assignment, activation/deactivation, and password reset.
- Role-based access control and administrator audit logging.
- PostgreSQL persistence for employee accounts, password hashes, sessions, and audit events.
- No seeded users and no hardcoded credentials.

## Requirements

- Node.js 22.5 or newer.
- PostgreSQL 14 or newer.

## Environment

Copy `.env.example` to `.env` for local development and set a valid PostgreSQL connection string in `DATABASE_URL`.

The application creates its required tables and indexes automatically when it starts.

## Start locally

```bash
npm install
node --env-file=.env src/server.mjs
```

Open `http://127.0.0.1:3000` unless you changed `HOST` or `PORT`.

## Create the first administrator

Populate the bootstrap values in your environment, then run:

```bash
node --env-file=.env src/bootstrap-admin.mjs
```

The bootstrap command refuses to create another bootstrap administrator after an active administrator exists. Additional administrators are managed from the admin console.

## Railway deployment

Production expects:

- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `DATABASE_URL` connected to the Railway PostgreSQL service.

Railway supplies `PORT` automatically. The application exposes `/api/health` for health checks.

## Test

```bash
npm test
```

## Repository layout

```text
public/   Browser UI and SVG assets
src/      HTTP server, PostgreSQL persistence, authentication, and RBAC
test/     Node test suite
```
