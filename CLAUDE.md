# TellingTree

Open-source genealogy app focused on storytelling and memories.

## Commands

### Backend
- **Install dependencies**: `uv sync`
- **Run tests**: `uv run pytest tests/ -v`
- **Start dev server**: `uv run uvicorn app.main:app --reload`
- **Create migration**: `uv run alembic revision --autogenerate -m "description"`
- **Apply migrations**: `uv run alembic upgrade head`
- **Start PostgreSQL (WSL)**: `sudo service postgresql start`

### Frontend
- **Install dependencies**: `cd frontend && npm install`
- **Start dev server**: `cd frontend && npm run dev` (runs on port 5173)
- **Type check**: `cd frontend && npm run build` (tsc + vite build)

## Project Layout

- `app/` — FastAPI backend (models, schemas, API routes, services)
- `client/` — Python SDK for programmatic API access (reuses `app/schemas/`)
- `tests/` — pytest suite (78 tests, backend + client)
- `dev/` — Design documentation (architecture, data model, API spec, decisions log)
- `storage/media/` — Local file uploads (git-ignored)
- `frontend/` — React 18 + TypeScript SPA (Vite, Shadcn/ui, TanStack Query)

## Conventions

- **Database URL**: Always use `postgresql+psycopg://` (psycopg v3, not psycopg2)
- **Password hashing**: Use `bcrypt` directly (not passlib — incompatible with Python 3.14)
- **DB session**: Lazy initialization in `app/db/session.py` — never create engine at import time
- **Tests**: Use in-memory SQLite via `StaticPool` — no PostgreSQL needed for tests
- **API versioning**: All routes under `/api/v1/`
- **IDs**: UUIDs everywhere
- **Relationship types**: Free-text strings, not enums
- **Permissions**: viewer (read) < editor (modify) < admin (manage members) — owner can do everything
- **Rate limiting**: Auth endpoints are rate-limited (10 req/min/IP) — reset in tests via `auth_rate_limiter._requests.clear()`
- **CORS**: Configured via `CORS_ORIGINS` env var (list of allowed origins)
- **Token lifetime**: Access=30min (in-memory), refresh=7 days (HttpOnly cookie, path=/api/v1/auth/refresh)
- **Auth on startup**: AuthContext attempts a silent `POST /auth/refresh` on mount. Cookie is sent automatically; if valid, access token is restored without re-login. `isLoading=true` until this resolves — ProtectedRoute shows a spinner instead of redirecting prematurely.
- **Production safety**: App refuses to start if `ENVIRONMENT=production` with default JWT secret
- **Token revocation**: `token_version` on User model — incremented on password change, embedded in JWTs, checked on every auth
- **Account deletion**: Requires password + no owned trees. Users must transfer tree ownership first via `PUT /trees/{id}/transfer`

## Documentation

- Record all design decisions in `dev/decisions.md` with date and rationale
- Update `dev/architecture.md` when adding new components
- Update `dev/api-spec.md` when adding/changing endpoints
- When the user gives suggestions, document them in `dev/decisions.md` under "User Suggestions"

## Frontend Conventions

- **Shadcn/ui v4**: Uses Base UI (`@base-ui/react`), not Radix — `asChild` does not exist on trigger components
- **Select handlers**: Always null-guard `onValueChange`: `(v) => { if (v !== null) setState(v); }`
- **Tokens**: Access token in React state (memory only, cleared on F5 but silently restored via cookie). Refresh token in HttpOnly Secure SameSite=Lax cookie — never readable by JS.
- **API imports**: Use `@/api/...` aliases — path defined in `tsconfig.app.json`
- **No baseUrl**: TypeScript paths use `@/*` alias only; do not add `baseUrl` (deprecated in TS 5.8+)
- **Query keys**: All TanStack Query keys live in `frontend/src/lib/queryKeys.ts`
- **No deprecation suppression**: Always fix the root cause; never use `ignoreDeprecations`
- **Graph layout**: `relatives-tree` calculates x/y positions (couple-as-unit model); React Flow (`@xyflow/react`) renders nodes and edges. Dagre is no longer used. `const enum` values from relatives-tree must use `as unknown as RelNode[]` cast due to esbuild const-enum limitations.
- **Graph root**: `GraphTab` tracks a `rootPersonId` state. Default is the oldest ancestor (no parents defined). Users can re-root via "Center tree on this person" in the person panel.
- **Date display**: Use `formatFlexDate(date, qualifier, date2, original)` from `@/lib/dates` everywhere dates are shown. Never display raw ISO strings.
- **GEDCOM import**: `POST /api/v1/trees/{id}/import/gedcom` — multipart upload, editor permission required. Service in `app/services/gedcom.py` uses `ged4py` for parsing.
- **Places API**: `GET /places/search?q=…` checks local DB (ILIKE) then geocodes via Nominatim on miss. All geocoding is server-side. Service in `app/services/geocoding.py`. Persons have nullable `birth_place_id`/`death_place_id` FKs alongside the raw `birth_location`/`death_location` strings.
- **Client SDK**: `client/` mirrors all backend endpoints. New: `client.places` (Places CRUD + search), `client.imports` (GEDCOM import via `ImportResult` dataclass). Run `from client import TellingTreeClient, ImportResult`.

## Tech Stack

- Python 3.14, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16
- Auth: JWT via python-jose, bcrypt for passwords
- Package manager: uv
- Client SDK: httpx (synchronous)
- Frontend: React 18 + TypeScript, Vite, Shadcn/ui v4, TanStack Query v5, React Router v6
- Graph: React Flow (`@xyflow/react`) for rendering + `relatives-tree` for family-tree-aware layout
- GEDCOM import: `ged4py` (Python) for parsing GEDCOM 5.5.1 files
