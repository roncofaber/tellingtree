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
- `tests/` — pytest suite (80 tests, backend + client)
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
- **Slugs**: Trees have a `slug` field (auto-generated from name, unique). Used in frontend URLs instead of UUIDs.
- **Relationship types**: Free-text strings, not enums
- **Permissions**: viewer (read) < editor (modify) < admin (manage members) — owner can do everything
- **Rate limiting**: Auth endpoints are rate-limited (10 req/min/IP) — reset in tests via `auth_rate_limiter._requests.clear()`
- **CORS**: Configured via `CORS_ORIGINS` env var (list of allowed origins)
- **Token lifetime**: Access=30min (in-memory), refresh=7 days (HttpOnly cookie, path=/api/v1/auth/refresh)
- **Auth on startup**: AuthContext attempts a silent `POST /auth/refresh` on mount. Cookie is sent automatically; if valid, access token is restored without re-login. `isLoading=true` until this resolves — ProtectedRoute shows a spinner instead of redirecting prematurely.
- **Session isolation**: `queryClient.clear()` on login/logout to prevent cross-account data leaks.
- **Production safety**: App refuses to start if `ENVIRONMENT=production` with default JWT secret
- **Token revocation**: `token_version` on User model — incremented on password change, embedded in JWTs, checked on every auth
- **Account deletion**: Requires password + no owned trees. Users must transfer tree ownership first via `PUT /trees/{id}/transfer`
- **Soft-delete**: Persons and stories use `deleted_at` instead of hard delete. Soft-deleted records excluded from all queries. Restorable via Trash in tree settings. Relationships/story-links to soft-deleted persons are filtered out in the frontend.
- **Hooks rule**: All React hooks MUST be called before any conditional `return` statements. This is the #1 source of bugs in this codebase — always verify hook order when adding state to page components.

## Documentation

- Record all design decisions in `dev/decisions.md` with date and rationale
- Update `dev/architecture.md` when adding new components
- Update `dev/api-spec.md` when adding/changing endpoints
- When the user gives suggestions, document them in `dev/decisions.md` under "User Suggestions"

## Frontend Conventions

- **Shadcn/ui v4**: Uses Base UI (`@base-ui/react`), not Radix — `asChild` does not exist on trigger components
- **Select handlers**: Always null-guard `onValueChange`: `(v) => { if (v !== null) setState(v); }`
- **Tokens**: Access token in React state (memory only, cleared on F5 but silently restored via cookie). Refresh token in HttpOnly Secure SameSite=Lax cookie — never readable by JS.
- **Media display**: Use `AuthImage` component or `fetchMediaBlob()` for authenticated media. Never use raw `<img src="/api/...">` — the access token is in memory, not cookies.
- **API imports**: Use `@/api/...` aliases — path defined in `tsconfig.app.json`
- **No baseUrl**: TypeScript paths use `@/*` alias only; do not add `baseUrl` (deprecated in TS 5.8+)
- **Query keys**: All TanStack Query keys live in `frontend/src/lib/queryKeys.ts`
- **No deprecation suppression**: Always fix the root cause; never use `ignoreDeprecations`
- **Utility functions**: `lib/person.ts` exports `getFullName()`, `getInitials()`, `genderColor()`. `lib/graphSettings.ts` exports `buildCardHtml()`, `genderIcon()`. Use these instead of inlining.
- **Delete confirmations**: All destructive actions must use `ConfirmDialog` component. All delete buttons must have `disabled={mut.isPending}`.
- **Error boundary**: `ErrorBoundary` component wraps the app root in `App.tsx`.

### Routes (slug-based, nested paths)

```
/login                                    → LoginPage
/register                                 → RegisterPage
/dashboard                                → DashboardPage (tree list + create/import)
/trees/:treeSlug                          → TreeDetailPage (Home tab)
/trees/:treeSlug/graph                    → TreeDetailPage (Graph tab — full tree + pedigree toggle)
/trees/:treeSlug/map                      → TreeDetailPage (Map tab — birth/death/story markers)
/trees/:treeSlug/people                   → TreeDetailPage (People tab)
/trees/:treeSlug/stories                  → TreeDetailPage (Stories tab)
/trees/:treeSlug/media                    → TreeDetailPage (Media tab)
/trees/:treeSlug/manage                   → TreeManagePage (Settings — General, Health, Graph, Places, Relationships, Data, Trash, Advanced)
/trees/:treeSlug/people/:personId         → PersonDetailPage
/trees/:treeSlug/stories/:storyId         → StoryDetailPage
/settings                                 → SettingsPage
/invite/:token                            → InvitePage
```

### Graph view
- `family-chart` (D3-based) handles layout AND rendering
- Data transformed via `toFamilyChartData()` using `indexRelationships()` (shared helper handling both `parent` and `child` types)
- Mounted imperatively via `useRef` + `useEffect`
- Card HTML generated by `buildCardHtml()` from `lib/graphSettings.ts` (shared with preview)
- Two modes: **Full tree** (vertical, family-chart native depth) and **Pedigree** (horizontal, ancestors only via `buildPedigreeData()`)
- Star icon on the card for "me" person (set in tree settings)
- Non-blocking side panel (not a modal Sheet) — graph stays interactive
- Children sorted by birth year via `setSortChildrenFunction()`
- `setShowSiblingsOfMain(true)` shows siblings of the centered person only (library limitation)

### Story editor (Lexical)
- Rich text editor with toolbar: bold, italic, underline, strikethrough, H2/H3, blockquote, lists, links, HR, undo/redo
- `@mention` typeahead for inline person tagging — smart shortcuts (`@me`, `@dad`, `@mom`, `@siblings`, etc.) when "You in this tree" is set
- Inline images via `ImageNode` (DecoratorNode) — drag/drop, paste, or toolbar button. Uploaded via `uploadMedia()`, rendered via `AuthImage`
- Document import: `.txt`, `.md` (markdown shortcuts), `.docx` (mammoth.js)
- Content stored as Lexical JSON in `stories.content` (TEXT column). Backward compatible with plain text.
- `extractMentionPersonIds()` walks JSON to sync `person_ids` on save
- `StoryRenderer` renders read-only with person hover cards (geocoded locations, linked stories)
- Tags: create/edit/delete with color picker, filter stories by tag

### Map tab
- Dot markers: blue (birth), gray (death), amber (story), green pin (selected person)
- Layer toggles: Birth, Death, Stories, Heatmap, Migration
- Person search highlights all their locations
- Legend overlay (bottom-left)
- Story locations resolved via `searchPlaces()` against the geocoding cache

### Date display
- Use `formatFlexDate(date, qualifier, date2, original)` from `@/lib/dates` everywhere
- Dates parsed with `new Date(year, month-1, day)` to avoid timezone offset bugs — never `new Date("YYYY-MM-DD")`

### Geocoding
- `GET /places/search?q=…` checks local DB (prefix match first, then ILIKE substring) then geocodes via Nominatim on miss
- Threshold: 6+ local results skip Nominatim
- Sub-localities: parser uses Nominatim result `name` field when it differs from municipality
- Coordinate deduplication: 0.001° (~111m)
- `GET /trees/{id}/places/details` returns places with associated person info
- Batch geocoding via `POST /trees/{id}/places/geocode-all` (streams NDJSON, rate-limited 1 req/sec)
- Places management in tree settings (Places tab): geocoded table, raw locations with remap/unlink, reset geocoding

## Tech Stack

- Python 3.14, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16
- Auth: JWT via python-jose, bcrypt for passwords
- Package manager: uv
- Client SDK: httpx (synchronous)
- Frontend: React 18 + TypeScript, Vite, Shadcn/ui v4, TanStack Query v5, React Router v6
- Graph: `family-chart` (D3-based family tree visualization with built-in layout, zoom/pan, and card rendering)
- Story editor: Lexical (Meta's rich text editor) with custom MentionNode, ImageNode, and plugins
- GEDCOM: `ged4py` for parsing GEDCOM 5.5.1 files, with duplicate detection, streaming import
- Maps: Leaflet + react-leaflet + leaflet.heat for geographic visualization
- Document import: mammoth.js for .docx conversion (client-side)
