# Changelog

## Neutral starter — this development run

### Added
- Accessible Vite/React TypeScript home screen with explicit live backend check, loading/success/error/retry states, and linked SQLite readiness page. Responsive flat warm-neutral styling, deep-teal primary action, native navigation and controls, focus/live-region/reduced-motion support, unknown-route recovery.
- Independent Express TypeScript API: dependency-free `/api/health`, real `/api/v1/readiness`, explicit method/OPTIONS behavior, configured CORS, bounded request bodies, safe 404/400/413/500/503 responses.
- Real Node 24 `node:sqlite` file connection with transactional, idempotent internal schema-version initialization and constraints. No in-memory fallback, domain entities or login.
- Startup/shutdown lifecycle with one connection, HTTP drain, duplicate-signal protection, listener/close error handling and forced-close deadline. Lifecycle and error middleware extracted for genuine branch tests.
- Tier-local pinned dependency manifests/locks, strict TypeScript builds, dev env templates, independent Dockerfiles, Nginx API proxy/history fallback, Docker Compose and persistent SQLite volume.
- Backend unit/API/lifecycle and integration tests; frontend component/client tests; desktop/mobile Playwright live journeys and clearly separated controlled loading/error fixtures. Preflight script and reviewer captures.

### Modified files / scope
- Original README.md replaced with runnable starter setup, configuration, API/test/build/container and persistence documentation. Original repository had no application to preserve; Git history retained.
- New source grouped in `backend/src/features`, `backend/src/db`, `backend/src/middleware`, `backend/src/lifecycle.ts`, and `frontend/src/features`; entry/config/build/deployment files support those modules.
- Health unknown-path test fixture changed from `/api/v1/readiness` to `/api/v1/missing` when readiness became implemented; exact 404 assertions retained.
- Added final development plan, worklist, test report and source publication metadata as pipeline artifacts (not application requirements).

### Breaking changes
No prior runtime/API existed, so no legacy interface is broken. Node.js 24 is required. This is explicitly a starter, not a domain application or authenticated service.

### Migration / deployment notes
Startup automatically initializes only `schema_version` with singleton id=1/version=1. No manual migration/seed command. Use a writable file-backed `DATABASE_URL=file:<path>`; memory URLs, remote file URLs and URI options are rejected. Keep runtime `.env`, database files and caches out of Git. Compose uses `/app/data/starter.db` in `sqlite-data`; retain/back up the volume, and avoid `docker compose down --volumes` unless intentional data deletion. Guest tests use `/tmp` to avoid source mount SQLite locking issues.

### Verification
84 backend cases (including 2 integration), 63 frontend cases, 14 browser cases pass; backend/frontend production builds and Compose build/start pass. Independent test critic PASS 1.00, zero high failures. Direct and Nginx-proxied real SQLite readiness returned exact 200 contract. No skipped test layers.
