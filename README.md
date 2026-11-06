# Neutral application starter

A small TypeScript foundation: an accessible Vite + React home screen and an
independent Express API. No domain features, login, credentials, or personal data.
The original dummy repository has been replaced with this approved starter.

## Requirements and local development

Use Node.js 24 and npm. Both tiers build independently. From a fresh checkout,
copy each tier's `.env.example` to `.env` (the provided local workspace already
includes runnable development `.env` files; these are intentionally untracked).

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

Open http://localhost:5173 and choose **Check backend**. The browser requests
`/api/health` through Vite's development proxy to port 3001. The page handles idle,
loading, success, malformed response, timeout, and network-error states; failures
offer **Retry check**, and success offers **Check again** for a fresh request.

## HTTP contract

- `GET /api/health`: 200, exactly `{"status":"ok"}`, with no database access.
- `OPTIONS /api/health`: 204 preflight; CORS grants only configured origins.
- Other health methods (including HEAD): 405, `{"error":"Method not allowed"}`;
  `Allow: GET, OPTIONS`. HEAD has no response body by HTTP convention.
- Unknown API paths: 404, `{"error":"Not found"}`.
- Malformed and oversized request bodies: safe 400 and 413 responses.

The client validates both HTTP 200 and the exact JSON contract. Unknown frontend
URLs show a not-found page with a home link. No readiness page or endpoint exists
in this slice.

## Configuration

`backend/.env.example` documents `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGINS`, and
`DATABASE_URL`. Startup rejects invalid ports, origins, and non-file database
URLs. An empty `CORS_ORIGINS` disables cross-origin browser access; same-origin
requests do not require CORS. Origins have no trailing slash or path.

`frontend/.env.example` documents `VITE_API_BASE_URL` (use `/` for same-origin,
never `/api`), `VITE_HEALTH_TIMEOUT_MS`, `DEV_API_PROXY_TARGET`, `DEV_HOST`, and
`DEV_PORT`. Vite public settings are build-time, not runtime secrets. The shipped
client does not contain a development backend hostname. Keep the frontend dev
port and backend CORS origin aligned if changing defaults.

SQLite will use Node 24's built-in `node:sqlite` with a file URL such as
`file:./data/starter.db`. This slice reserves configuration and a compose volume
only: it does **not** open a database, create schemas, or claim database readiness.

## Tests and builds

All scripts invoke tool entries directly with Node; npm bin-links are unnecessary.

```sh
cd backend
npm test -- tests/health.test.ts
npm run build
# Production listener, after build:
npm start
```

```sh
cd frontend
npm test
npm run build
```

Backend API tests use the real Express app through Supertest, without a database.
Frontend client and component suites cover transport/response errors separately.
Playwright specs use real servers, no mocks, and desktop/mobile Chromium projects:

```sh
cd frontend
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

The frontend-local Playwright config starts and stops both tiers, uses one worker,
captures browser errors, and retains failure traces. `E2E_FRONTEND_PORT` and
`E2E_BACKEND_PORT` optionally override its ports. These must be free; it will not
silently reuse another running server. Transport-error/retry and loading behavior
belong to deterministic component tests, rather than fake E2E route interception.

## Containers

```sh
docker compose up --build -d
```

Open http://localhost:8080. Nginx provides history fallback and proxies `/api/` to
`backend:3001`, preserving the request path. Each tier has its own Dockerfile and
build context. Host port overrides are `FRONTEND_PORT` and `BACKEND_PORT`; optional
compose `CORS_ORIGINS`, `VITE_API_BASE_URL`, and `VITE_HEALTH_TIMEOUT_MS` overrides
can be supplied in the shell. The named `sqlite-data` volume is reserved for the
future file-backed database slice and currently contains no application schema.

E2E, container runtime checks, and publication are handled by the parent workflow,
not implied by this bootstrap's successful build or unit tests.
