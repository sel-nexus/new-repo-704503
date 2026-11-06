# Neutral application starter

A tested TypeScript foundation using Vite + React, Express, and file-backed SQLite. Built in the adopted dummy repository after explicit approval of starter-only scope. No domain features, login, credentials or personal data are included. Git history is preserved.

## Run locally
Requires Node.js 24 and npm. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Workspace dev copies are provided but untracked. Each tier builds independently.

In separate terminals:
```sh
cd backend
npm ci --no-bin-links
npm run dev
```
```sh
cd frontend
npm ci --no-bin-links
npm run dev
```
Open http://localhost:5173. Click **Check backend** for a fresh liveness request. Follow **Database readiness** to verify the actual SQLite metadata; navigate back with **Home**. Checks expose loading, success and safe error/retry states. Unknown frontend URLs offer a home link.

## API
- `GET /api/health`: 200 `{"status":"ok"}`, dependency-free, no-store.
- `GET /api/v1/readiness`: 200 `{"status":"ready","database":"sqlite","schemaVersion":1}`; unavailable connection/schema returns 503 `{"error":"Database unavailable"}`.
- Endpoint OPTIONS: 204; unsupported methods, including HEAD: 405 with Allow header (HEAD has no body).
- Unknown API paths: 404 `{"error":"Not found"}`.
- Malformed/oversized bodies: safe 400/413; unexpected errors: safe 500.
No authentication or business-write endpoints exist. CORS is a browser access policy, not authentication. Do not expose this starter as an authenticated product without adding the required controls.

## SQLite and configuration
Backend validates `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGINS`, `DATABASE_URL`; defaults/contracts are documented in `backend/.env.example`. Startup opens one Node built-in `node:sqlite` connection, creates the parent directory and transactionally initializes a constrained internal `schema_version` singleton. Migration is idempotent; no separate migration CLI or seed user is needed. Normal shutdown drains HTTP before closing SQLite; forced shutdown has a bounded deadline. Memory URLs are rejected.

Use `DATABASE_URL=file:./data/starter.db` or a writable absolute local path such as `file:/tmp/starter-dev.db`. This application's URL syntax is `file:<path>`, not `file://`. No query/fragment options. On NTFS-backed sandbox mounts SQLite locks may fail; use a guest-local filesystem or Docker volume, not the source bind mount. Back up the SQLite file before future schema changes. Do not delete the data volume to upgrade.

Frontend settings: `VITE_API_BASE_URL` (`/` for same-origin), `VITE_HEALTH_TIMEOUT_MS` (shared check timeout), `DEV_API_PROXY_TARGET`, `DEV_HOST`, `DEV_PORT`. Vite public settings are build-time; no secrets belong in them. Dev proxy addresses backend; production Nginx proxies `/api/` to `backend:3001`. An empty backend CORS list disables cross-origin grants; same-origin needs none. Changing development ports requires aligning proxy/CORS settings.

## Tests and production builds
Scripts invoke package entries directly with Node (no bin-link shims required).
```sh
cd backend
npm test
npm run build
npm start
```
Sandbox SQLite tests use guest temporary files:
```sh
TMPDIR=/tmp TMP=/tmp TEMP=/tmp npm test
```
```sh
cd frontend
npm test
npm run build
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```
Playwright starts/stops both tiers; ports must be free. Optional `E2E_FRONTEND_PORT`, `E2E_BACKEND_PORT`, `E2E_DATABASE_URL` override test settings. Default E2E database is `file:/tmp/starter-e2e.db`, separate from dev data. Desktop/mobile real positive journeys require actual backend JSON. Separate controlled state fixtures hold/forward real requests and supply malformed responses to test loading/error/retry, then restore live traffic. Console/page errors fail the tests. Unit frontend transport mocks are explicit; backend tests use real file-backed SQLite.

Verified: 84 backend cases including 2 integration tests, 63 frontend cases, 14 Playwright cases; both builds pass. Independent test critic: PASS, 1.00, zero high failures. `node preflight.mjs` in frontend captures desktop/mobile accessibility structure, computed style and HTML plus reviewer screenshots. Runtime checks are not a claim of domain-product completeness.

## Containers
```sh
docker compose up --build -d
```
Open http://localhost:8080. Both tier images build independently; backend runs as Node's non-root user. SQLite lives in named `sqlite-data` volume at `/app/data/starter.db`. Host overrides `FRONTEND_PORT`/`BACKEND_PORT`; optional CORS/client build values are in compose. History fallback supports `/readiness` on refresh. Compose startup and both direct/proxied readiness responses were verified. `docker compose down` retains data; `down --volumes` deletes it.

## Layout
- `backend/src/features/health` and `readiness`: separate HTTP/service modules.
- `backend/src/db`: real connection/migration; `lifecycle.ts` and `middleware`: lifecycle/safe errors.
- `frontend/src/features`: check pages, clients and component tests.
- `frontend/e2e`: unmocked journeys and controlled state fixtures.
- `CHANGELOG.md`: changes and migration notes.
