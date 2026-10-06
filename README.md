# Fox Pvt. Ltd. Organization Suite

Initial organization portal for Fox Pvt. Ltd., a home-automation company focused on robotics, connected devices, and AI-assisted environments.

## Included in this first release

- Public corporate landing page with an original fox mark and home-automation positioning.
- Employee sign-in using Employee ID and password.
- Employee portal with role-aware workspace sections.
- Administrator console for employee creation, role assignment, activation/deactivation, and password reset.
- Role-based access control and administrator audit logging.
- SQLite persistence using Node's built-in `node:sqlite` API.
- No seeded users and no hardcoded credentials.

## Requirements

- Node.js 22.5 or newer.

## Start locally

```bash
cp .env.example .env
node --env-file=.env src/server.mjs
```

Open `http://127.0.0.1:3000` unless you changed `HOST` or `PORT`.

## Create the first administrator

Populate the bootstrap values in your environment, then run:

```bash
node --env-file=.env src/bootstrap-admin.mjs
```

The bootstrap command refuses to create a second bootstrap administrator after an administrator already exists. Additional administrators can be created from the admin console.

## Test

```bash
npm test
```

## Repository layout

```text
public/                 Browser UI and SVG assets
src/                    HTTP server, database, authentication, and RBAC
test/                    Built-in Node test suite
```

Runtime data is stored under `data/` by default and is ignored by Git.
