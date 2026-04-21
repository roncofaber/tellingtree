# TellingTree — Design Decisions Log

This document tracks key design decisions and user suggestions for the project.

## Initial Design Choices (2026-04-18)

### Relationship Model: Fully Flexible
**Decision**: Relationship types are stored as free-text strings, not database enums.
**Rationale**: Users should be able to define any relationship (parent, godparent, mentor, caretaker, best friend, etc.) without backend changes. The frontend can suggest common types while allowing custom input.

### Stories: Full Multimedia
**Decision**: Stories support text, photos, audio, video, and documents — all stored and served by the backend.
**Rationale**: The core value proposition is storytelling. Media brings memories to life. Limiting to text-only would undermine the app's purpose.

### Auth: Full Auth + Sharing
**Decision**: JWT-based user accounts with tree sharing via roles (viewer/editor/admin).
**Rationale**: Family trees are inherently collaborative. Multiple family members should be able to contribute stories and corrections while maintaining control over who can edit vs. view.

### Storage: Local Filesystem (Abstracted)
**Decision**: Start with local filesystem storage behind an abstract interface.
**Rationale**: Simplest to develop and test. The abstraction layer makes it easy to swap in S3 or any cloud storage later without changing business logic.

### Package Manager: uv
**Decision**: Use `uv` for Python dependency management.
**Rationale**: Fast, modern, handles virtual environments and pyproject.toml well.

### Database IDs: UUIDs
**Decision**: All primary keys are UUIDs.
**Rationale**: Better for distributed systems, URL-safe, no information leakage about record counts or ordering.

### API Versioning: URL-based (/api/v1/)
**Decision**: Version the API via URL prefix.
**Rationale**: Simple, explicit, easy to maintain multiple versions if needed.

### Password Hashing: bcrypt directly (not passlib)
**Decision**: Use the `bcrypt` package directly instead of `passlib[bcrypt]`.
**Rationale**: `passlib` has a compatibility bug with Python 3.14 (crashes during its bcrypt backend detection). Using `bcrypt` directly is simpler and avoids the issue. The `app/core/security.py` module wraps `bcrypt.hashpw` and `bcrypt.checkpw` for clean usage.

### DB Session: Lazy Initialization
**Decision**: The SQLAlchemy engine and session factory are created lazily on first use, not at module import time.
**Rationale**: Allows tests to override `get_db` with an in-memory SQLite database without triggering a PostgreSQL connection. Also prevents import-time failures when the database is unavailable.

### Testing: In-Memory SQLite
**Decision**: Tests use an in-memory SQLite database with `StaticPool` instead of requiring PostgreSQL.
**Rationale**: Fast, zero-setup test execution. No Docker or database service needed to run the test suite. SQLite is sufficient for testing application logic; PostgreSQL-specific features (if any) would need integration tests.

### Python Client SDK: Same Repo, Shared Schemas (2026-04-18)
**Decision**: The Python client SDK lives in `client/` within the same repo and imports Pydantic models from `app/schemas/`.
**Rationale**: The client is tightly coupled to the API — every endpoint change affects both. Sharing schemas means zero model duplication and automatic consistency. If the client ever needs to be published independently (PyPI, separate repo), the schemas can be extracted at that point.

### Client Architecture: Namespaced Sub-Clients
**Decision**: The `TellingTreeClient` composes resource-specific sub-clients (`client.auth`, `client.trees`, `client.persons`, etc.) rather than a flat API.
**Rationale**: Scales cleanly as endpoints grow. Groups related operations logically. Mirrors the API route structure.

### Client HTTP Layer: Synchronous httpx
**Decision**: The client uses synchronous `httpx.Client`, not async.
**Rationale**: Primary use cases are scripts, REPL sessions, and seed data — all synchronous contexts. Async would add complexity (asyncio.run, await everywhere) for no benefit.

### Database URL: postgresql+psycopg (2026-04-18)
**Decision**: Use `postgresql+psycopg://` as the SQLAlchemy URL scheme instead of `postgresql://`.
**Rationale**: The project uses `psycopg` v3 (not `psycopg2`). The default `postgresql://` scheme makes SQLAlchemy look for `psycopg2`, causing `ModuleNotFoundError`. The `+psycopg` suffix explicitly selects the v3 driver.

## Security Hardening (2026-04-18)

### CORS Middleware
**Decision**: Add CORS middleware with configurable `cors_origins` setting. Defaults to `localhost:3000` and `localhost:5173` (common frontend dev ports).
**Rationale**: Required for the frontend to call the API. Without CORS, browsers block cross-origin requests. Origins are configurable via `CORS_ORIGINS` env var for production.

### Rate Limiting on Auth Endpoints
**Decision**: In-memory rate limiter on `/auth/register` and `/auth/login` — 10 requests per IP per 60 seconds.
**Rationale**: Prevents brute-force password attacks and registration spam. In-memory is sufficient for single-instance deployment; would need Redis-backed rate limiting for multi-instance.

### Access Token Lifetime: 30 Minutes
**Decision**: Reduced access token from 24 hours to 30 minutes. Refresh token stays at 7 days.
**Rationale**: 24h is too long — a stolen token gives extended access. 30min limits the damage window. The refresh token flow (`POST /auth/refresh`) keeps users from having to re-login constantly.

### Password Change Endpoint
**Decision**: `PUT /api/v1/users/me/password` — requires `current_password` and `new_password`.
**Rationale**: Users need to be able to change their password. Requiring the current password prevents unauthorized changes if someone gains access to an active session.

### JWT Secret Validation in Production
**Decision**: App refuses to start if `ENVIRONMENT=production` and `JWT_SECRET_KEY` is still a default/insecure value.
**Rationale**: Deploying with the default secret means anyone can forge valid JWT tokens. Fail-fast prevents accidental misconfiguration.

### Login Timing Attack Mitigation
**Decision**: When a user is not found during login, run a dummy `bcrypt.hashpw` + `bcrypt.checkpw` before returning the error.
**Rationale**: Without this, login with a non-existent user returns faster (no bcrypt work) than login with a wrong password (bcrypt runs). An attacker could use the timing difference to enumerate valid usernames.

## Code Quality Audit Fixes (2026-04-18)

### Email Validation with EmailStr
**Decision**: Use Pydantic's `EmailStr` for email fields in `UserCreate` and `UserUpdate` schemas. Added `pydantic[email]` dependency.
**Rationale**: Plain `str` allowed invalid emails like "not-an-email" to be stored. `EmailStr` validates format and normalizes the value.

### Story Link/Tag Endpoints: Consistent 204 Responses
**Decision**: Changed `POST .../stories/{id}/persons/{id}` and `POST .../stories/{id}/tags/{id}` from returning `201` with `{"detail": "..."}` to returning `204` with no body. Idempotent — silently succeeds if link already exists.
**Rationale**: Matches the `DELETE` counterparts (also 204). Removes inconsistent response patterns and simplifies client code.

### Media Cascade Delete + File Cleanup
**Decision**: Changed media FK `ondelete` from `SET NULL` to `CASCADE` for `story_id` and `person_id`. Added SQLAlchemy `after_delete` event listener to clean up files from disk.
**Rationale**: `SET NULL` left orphaned media records and files on disk when stories/persons were deleted. Cascade ensures media is cleaned up automatically.

### Storage Paths: Relative Instead of Absolute
**Decision**: `storage_path` in the database now stores relative paths (`{tree_id}/{media_id}{ext}`) instead of absolute paths. `resolve_path()` reconstructs the full path at runtime using `settings.storage_path`.
**Rationale**: Absolute paths break when the storage backend changes (e.g., local → S3) or when the app moves to a different directory. Relative paths + runtime resolution keeps the DB portable.

### Docker Compose: Use .env File
**Decision**: Changed `docker-compose.yml` to use `env_file: .env` instead of hardcoding all env vars. Only `DATABASE_URL` is overridden (to use `postgres` hostname instead of `localhost`).
**Rationale**: Single source of truth for configuration. Avoids drift between `.env`, `.env.example`, and `docker-compose.yml`.

## Pre-Production Security (2026-04-18)

### Token Revocation via Version Counter
**Decision**: Added `token_version` (int, default 0) to the `users` table. The version is embedded in JWT payloads as `"ver"`. On every authenticated request, the token's version is compared to the DB value. Mismatches are rejected. `change_password` increments the version.
**Rationale**: Without revocation, a stolen token remains valid until it expires (30 min). The version counter invalidates all existing tokens when the password changes, with zero overhead (no blacklist table, no extra DB queries beyond the user lookup already happening).

### Account Deletion (GDPR)
**Decision**: `DELETE /api/v1/users/me` deletes the authenticated user's account. Requires password confirmation. Blocks if the user owns any trees — they must transfer ownership first via `PUT /trees/{id}/transfer`.
**Rationale**: GDPR requires users to be able to delete their data. Requiring tree transfer before deletion prevents accidental data loss for collaborative trees. Solo trees (no members) should be transferred or deleted by the user before account deletion.

### Tree Ownership Transfer
**Decision**: `PUT /api/v1/trees/{id}/transfer` transfers ownership to an existing tree member. Only the current owner can transfer. The new owner is removed from the `tree_members` table (owners are above members).
**Rationale**: Needed to support account deletion for users who own collaborative trees. Also useful independently — e.g., the family historian passes the torch to someone else.

### Email Verification — Deferred
**Decision**: Email verification is not yet implemented. All registered accounts are immediately active.
**Rationale**: Requires email delivery infrastructure (SMTP, SendGrid, etc.) which hasn't been chosen yet. Will implement when the decision is made. Noted as a known gap.

## Frontend Stack (2026-04-18)

### Framework: React + TypeScript + Vite
**Decision**: Use React 18 with TypeScript, bundled by Vite.
**Rationale**: React has the largest ecosystem and component library support. TypeScript catches API contract mismatches at compile time. Vite provides instant HMR and fast builds.

### Component Library: Shadcn/ui v4
**Decision**: Use Shadcn/ui (components built on Base UI) with Tailwind CSS v4.
**Rationale**: Copy-paste components mean no dependency lock-in; styling is fully under project control. Base UI provides accessible unstyled primitives. Tailwind v4 integrates via `@tailwindcss/vite` without a separate PostCSS step.

### API State: TanStack Query v5
**Decision**: All server state managed by TanStack Query (fetching, caching, mutations, cache invalidation).
**Rationale**: Handles loading/error states, background refetch, and stale-while-revalidate automatically. Eliminates boilerplate useState+useEffect patterns for every endpoint.

### Tokens: In-Memory (React State)
**Decision**: Access and refresh tokens are stored in React state (AuthContext), never in localStorage or cookies.
**Rationale**: localStorage tokens are vulnerable to XSS attacks — any injected script can steal them. In-memory tokens are cleared on page refresh (acceptable — the refresh token flow re-authenticates automatically).

### TypeScript Paths Without baseUrl
**Decision**: `tsconfig.app.json` uses `paths: {"@/*": ["./src/*"]}` without setting `baseUrl`.
**Rationale**: `baseUrl` is deprecated in TypeScript 5.8+. Omitting it avoids deprecation warnings while preserving the `@/` import alias for clean absolute imports.

### No Deprecation Workarounds
**Decision**: When a deprecation warning is encountered, choose the forward-compatible solution rather than suppressing with `ignoreDeprecations` or similar flags.
**Rationale**: User explicitly requested future-proof solutions. Suppressing warnings is technical debt that must be cleaned up later when the deprecated API is removed.

## Feature Additions (2026-04-19)

### Graph Layout: relatives-tree over Dagre
**Decision**: Replace `@dagrejs/dagre` with `relatives-tree` for family tree layout calculation. React Flow (`@xyflow/react`) is kept for node rendering, interactions, and edge drawing.
**Rationale**: Dagre is a generic DAG layout engine — it has no concept of couples. Spouses end up on different generation levels when they have different numbers of defined ancestors, and children dangle incorrectly. `relatives-tree` uses the couple-as-unit model (same approach as Gramps/Ancestry/FamilySearch): spouses are always co-ranked, children descend from their midpoint. Graphviz WASM was considered but rejected due to the ~3MB bundle size with minimal quality gain for typical genealogy trees.

### Flexible Date Model
**Decision**: Each date field (birth, death) is supplemented by three companion columns: `{field}_date_qualifier` (string: exact/year-only/about/before/after/between/estimated/calculated), `{field}_date_2` (for "between" ranges), and `{field}_date_original` (raw string for lossless round-trips from GEDCOM).
**Rationale**: GEDCOM 5.5.1 supports approximate dates (ABT 1920), boundary dates (BEF 1960, AFT 1824), ranges (BET 1910 AND 1920), and year-only dates (1924). Storing these as plain Date columns loses the uncertainty information. Adding qualifier+range columns keeps the Date column sortable/filterable while preserving full semantics. This approach mirrors ged4py's DateValue class hierarchy and Gramps's Date.modifier pattern.

### GEDCOM Import
**Decision**: `POST /api/v1/trees/{id}/import/gedcom` accepts a multipart `.ged` file upload and bulk-creates persons and relationships. Uses `ged4py` for parsing. No deduplication — running twice creates duplicates (warned in UI).
**Rationale**: The most common user need is migrating existing data from Heredis, Gramps, Ancestry, etc. GEDCOM 5.5.1 is the universal export format. `ged4py` was chosen over `python-gedcom` for its typed DateValue class hierarchy and active maintenance (v0.5.2, March 2025). A custom parser was considered but rejected — `ged4py` handles all encoding variants and date edge cases that a custom parser would need to re-implement.

### Person Model: Extended Fields
**Decision**: Added `maiden_name`, `nickname`, `death_location`, `is_living` (Boolean nullable), `occupation`, `nationalities` (JSON array), `education`, `profile_picture_id` (FK → media).
**Rationale**: Standard genealogy fields missing from the initial model. `nationalities` is a JSON array to support multiple citizenships without a join table, and because SQLAlchemy JSON works in both PostgreSQL (native) and SQLite (tests). `profile_picture_id` uses `use_alter=True` FK to handle the circular reference with the media table.

### Relationship Types: spouse + partner
**Decision**: Added `partner` as a recognized relationship type alongside `spouse`. Both support `start_date`/`end_date`. Ended relationships (has `end_date`) render with a gray dashed edge in the graph.
**Rationale**: Modern genealogy must accommodate non-married partnerships. The data model already had `start_date`/`end_date` on relationships; exposing them in the UI required only frontend changes.

### Places: Global Geocoding Cache
**Decision**: Added a global `places` table (not tree-scoped) used as a geocoding cache. Persons have nullable FKs `birth_place_id` and `death_place_id` pointing to it, alongside the existing raw string columns `birth_location`/`death_location`. The `GET /places/search?q=…` endpoint checks the local cache first and calls Nominatim on a miss. All geocoding is server-side — the browser never calls Nominatim directly.
**Rationale**: Geocoding the same place (e.g. "Mendrisio, Switzerland") repeatedly wastes API quota and adds latency. A shared cache means a place is geocoded once regardless of how many persons reference it or across how many trees. Keeping places global (not per-tree) enables future cross-tree map features. The raw string columns are preserved alongside the FK to maintain historical fidelity (the original text from a genealogy source may differ from the canonical modern name). Nominatim was chosen for interactive autocomplete (free, no key); OpenCage was identified as the better option for batch geocoding of large GEDCOM imports (free tier, better historical coverage) — this is deferred until map mode is built.

### Navigation: Tree Overview + Graph + Manage split
**Decision**: The tree detail page was split into three distinct areas: `/trees/:id` (overview with stats and recent activity), `/trees/:id/graph` (full-screen graph view), and `/trees/:id/manage/*` (sidebar management UI for persons, relationships, stories, media, places, members).
**Rationale**: The original single-page tabs layout mixed browsing and management. The new structure separates concerns: the overview page is the landing page, the graph is the primary browsing interface, and manage is for data entry/correction. This matches how genealogy tools like Gramps and Ancestry structure their UX.

### Graph: family-chart adoption (2026-04-20)
**Decision**: Replaced React Flow + entitree-flex (+ earlier relatives-tree) with `family-chart`, a D3-based library purpose-built for family tree visualization. The library handles layout, rendering, zoom/pan, couple placement, and DAG deduplication out of the box. Mounted imperatively via `useRef`/`useEffect` since it's D3-based, not React-declarative.
**Rationale**: The React Flow approach required hundreds of lines of custom layout code that never worked reliably — spouses weren't adjacent, children appeared above parents, and the coordinate mapping was fragile. After trying three different layout engines (relatives-tree, entitree-flex, dagre), we evaluated what production genealogy apps use (Topola: d3-flextree, Gramps: D3, dTree: D3) and found `family-chart` — a complete solution that handles all genealogy-specific layout challenges natively. Reduced GraphTab from ~700 lines to ~350 lines.

### GEDCOM: Robust import pipeline (2026-04-20)
**Decision**: The GEDCOM importer was hardened with: (1) HTML sanitization for malformed NOTE records, (2) `sys.setrecursionlimit(10000)` for ged4py's recursive parsing, (3) column widening (names to 500, date originals to 255) with safety truncation, (4) in-memory duplicate detection via hash sets (O(1) per record), (5) NDJSON streaming progress events, (6) batch commits every 50 records for fault tolerance, (7) own DB session in the streaming endpoint to avoid FastAPI dependency lifecycle issues.
**Rationale**: The Queen Elizabeth II GEDCOM file (4,683 persons, 105K lines) exposed multiple failure modes: raw HTML in NOTE fields crashed ged4py's parser, names like "Jesus Christ" exceeded VARCHAR(255), a single DB error cascaded to all subsequent records via session rollback, and the synchronous endpoint timed out on large files. Each fix was driven by a specific real-world failure.

### Geocoding: Batch processing and heatmap (2026-04-20)
**Decision**: Added batch geocoding (`POST /trees/{id}/places/geocode-all`) that processes all raw locations with streaming progress, rate-limited to 1 req/sec for Nominatim compliance. Added heatmap toggle to the Places map via `leaflet.heat`. Coordinate-based deduplication (0.005° ~500m) replaces exact name matching for place deduplication.
**Rationale**: GEDCOM imports create hundreds of raw location strings that need geocoding. One-by-one clicking was impractical. The rate limiter is thread-safe and global, preventing abuse even with concurrent users. The heatmap provides instant visual insight into where a family's history is concentrated geographically.

## User Suggestions

### Documentation in dev/ folder (2026-04-18)
**Suggestion**: All design decisions and architecture should be documented in a `dev/` folder.
**Rationale**: Ensures design consistency and helps future agents/contributors collaborate on the project.
