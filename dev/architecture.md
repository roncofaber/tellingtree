# TellingTree — Architecture

## Overview

TellingTree is an open-source genealogy application with a focus on storytelling and memories. Rather than just charting family trees, it emphasizes the narratives, photos, audio, and videos that bring family history to life.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend API | FastAPI | Async Python web framework with automatic OpenAPI docs |
| Database | PostgreSQL 16 | Relational DB for structured genealogy data |
| ORM | SQLAlchemy 2.0 | Async-compatible ORM with declarative models |
| Migrations | Alembic | Schema versioning and migration management |
| Auth | JWT (python-jose) | Stateless token-based authentication |
| Password hashing | bcrypt | Direct bcrypt hashing (passlib dropped due to Python 3.14 incompatibility) |
| File storage | Local filesystem | Abstracted for future S3/cloud migration |
| Package manager | uv | Fast Python dependency management |
| Containerization | Docker + Docker Compose | PostgreSQL + app services |
| Python Client SDK | httpx | Programmatic API access for dev, scripts, and integrations |
| Frontend | React 18 + TypeScript | Vite, Shadcn/ui (Base UI), TanStack Query v5, React Router v6 |

## Frontend Architecture

The `frontend/` directory is a Vite + React + TypeScript SPA.

### Key choices

| Concern | Solution |
|---------|----------|
| Component library | Shadcn/ui v4 (built on Base UI / Radix primitives) |
| API state | TanStack Query v5 — all fetches, mutations, cache invalidation |
| Routing | React Router v6 |
| Tokens | In-memory React state (not localStorage) — harder to steal via XSS |
| Auth refresh | API client auto-retries on 401 via refresh token |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` plugin |

### Frontend structure

```
frontend/
├── src/
│   ├── api/          # Typed API client (fetch wrapper + per-resource modules)
│   ├── contexts/     # AuthContext — tokens, login, logout, auto-refresh
│   ├── components/   # UI: layout/, common/, tree/, ui/ (Shadcn auto-generated)
│   ├── pages/        # Route-level components
│   ├── lib/          # queryKeys, constants, utils
│   └── types/        # TypeScript interfaces mirroring API schemas
```

### Shadcn/ui v4 notes

- Uses Base UI primitives (`@base-ui/react`), **not** Radix UI
- `asChild` prop does **not** exist — compose trigger elements as plain DOM elements with Tailwind classes
- `Select.onValueChange` signature: `(value: string | null, details) => void` — always null-guard before calling setState

### Routes

Routes use tree slugs (not UUIDs) and nested paths (not query params):

```
/login                                    → LoginPage
/register                                 → RegisterPage
/dashboard                                → DashboardPage
/trees/:treeSlug                          → TreeDetailPage (Home)
/trees/:treeSlug/graph                    → Graph (full tree + pedigree toggle)
/trees/:treeSlug/map                      → Map (birth/death/story markers, heatmap, migration)
/trees/:treeSlug/people                   → People list
/trees/:treeSlug/stories                  → Stories list
/trees/:treeSlug/media                    → Media gallery
/trees/:treeSlug/manage                   → Settings (General, Health, Graph, Places, Relationships, Data, Trash, Advanced)
/trees/:treeSlug/people/:personId         → PersonDetailPage (timeline, relationships, photos)
/trees/:treeSlug/stories/:storyId         → StoryDetailPage (Lexical rich text, tags, attachments)
/settings                                 → User settings
/invite/:token                            → Invite acceptance
```

The graph tab accepts `?root=<personId>` to center on a specific person.

## Architecture Principles

1. **API-first**: Backend exposes a RESTful API (versioned at `/api/v1/`). Frontend will consume this API.
2. **Resource-scoped**: All data is scoped to a tree. Persons, stories, relationships, media, and tags all belong to a tree.
3. **Flexible by default**: Relationship types are free-text (not enums). Gender is flexible. Stories can link to any number of persons.
4. **Role-based access**: Trees can be shared with other users. Roles: viewer (read-only), editor (modify data), admin (manage members).
5. **Media abstraction**: File storage uses an abstract interface so we can swap local filesystem for S3 without changing business logic.

## Security

- **CORS**: Configurable allowed origins via `CORS_ORIGINS` env var
- **Rate limiting**: 10 req/min per IP on auth endpoints (in-memory, `app/core/rate_limit.py`)
- **JWT tokens**: 30min access + 7-day refresh; production startup rejects default secrets
- **Password hashing**: bcrypt with timing-safe login (dummy hash on unknown users)
- **RBAC**: Tree-level roles (viewer/editor/admin) enforced on every mutation endpoint

## Request Flow

```
Client → CORS → FastAPI Router → Rate Limit → Auth Dependency → Permission Check → Service Layer → SQLAlchemy → PostgreSQL
                                                                                        ↓
                                                                                  Storage Service → Filesystem / S3
```

## Project Structure

```
tellingtree/
├── app/
│   ├── main.py              # FastAPI app factory, middleware, exception handlers
│   ├── config.py             # Pydantic Settings (env-based config)
│   ├── core/                 # Security, auth deps, error definitions
│   ├── db/                   # SQLAlchemy engine, session, base
│   ├── models/               # SQLAlchemy ORM models
│   ├── schemas/              # Pydantic request/response schemas
│   ├── api/v1/               # Route handlers by resource
│   └── services/             # Business logic (auth, storage, permissions)
├── client/
│   ├── __init__.py           # Exports TellingTreeClient
│   ├── client.py             # Main client — composes sub-clients
│   ├── _base.py              # Shared HTTP helpers + auth header injection
│   ├── auth.py               # Register, login, refresh
│   ├── users.py              # User profile
│   ├── trees.py              # Tree CRUD + member management
│   ├── persons.py            # Person CRUD
│   ├── relationships.py      # Relationship CRUD + per-person listing
│   ├── stories.py            # Story CRUD + person/tag linking
│   ├── media.py              # Upload, download, delete
│   └── tags.py               # Tag CRUD
├── alembic/                  # Database migrations
├── tests/                    # pytest test suite
├── dev/                      # Design documentation
├── storage/media/            # Local file uploads (git-ignored)
├── frontend/                 # React SPA (Vite + TypeScript + Shadcn/ui)
├── docker-compose.yml        # PostgreSQL + app
└── pyproject.toml            # Dependencies and project config
```

## Testing

Tests use an **in-memory SQLite** database (via `StaticPool`) to avoid requiring a running PostgreSQL instance. The SQLAlchemy engine uses lazy initialization (created on first use, not at import time) so that test fixtures can override `get_db` before any connection is attempted.

Test stack: `pytest` + `FastAPI TestClient` + `httpx`.

Run tests: `uv run pytest tests/ -v`

## Python Client SDK

The `client/` package provides a typed Python SDK for the API. It's a developer/admin tool — end-users interact through the web frontend.

```python
from client import TellingTreeClient

with TellingTreeClient("http://localhost:8000") as c:
    c.auth.register(email="grandma@family.com", username="grandma", password="password123")
    c.auth.login(username="grandma", password="password123")

    tree = c.trees.create(name="The Johnson Family")
    person = c.persons.create(tree.id, given_name="Eleanor", birth_date="1932-03-15")
    c.stories.create(tree.id, title="Summer of '62", person_ids=[person.id])
```

Key design choices:
- **Reuses `app/schemas/`** — no model duplication; client returns the same Pydantic types as the server
- **Namespaced sub-clients** — `client.trees`, `client.persons`, etc. for clean organization
- **httpx** — synchronous HTTP client for simplicity in scripts and REPL usage
- **Context manager** — `with` statement handles connection cleanup

## Database Session

The DB engine and session factory use lazy initialization (`app/db/session.py`). This is important because:
1. Tests can override `get_db` without triggering a PostgreSQL connection
2. The app doesn't fail at import time if the database is unavailable
3. Configuration changes (e.g., `DATABASE_URL` from env) are respected at runtime

## Graph Visualization

The family tree graph uses `family-chart`, a D3-based library purpose-built for genealogy.

### Data flow

```
Person[] + Relationship[]
  → indexRelationships()       # shared helper handling parent + child types (deduped via Sets)
  → toFamilyChartData()        # pre-indexed O(n+m) transformation
  → f3.createChart(cont, data) # library handles layout + SVG rendering
  → buildCardHtml()            # shared card renderer (lib/graphSettings.ts) — used by graph AND preview
  → click/zoom/pan interactions via library callbacks
```

### View modes

- **Full tree** (default): vertical layout, family-chart handles depth natively with `setAncestryDepth()`/`setProgenyDepth()`. `setShowSiblingsOfMain(true)` shows siblings of the centered person.
- **Pedigree**: horizontal layout (`setOrientationHorizontal()`), data pre-filtered to direct ancestors only via `buildPedigreeData()`. Depth-limited.

### Features

- Configurable depth (1-5 or unlimited) with animated transitions
- Full/Pedigree toggle in controls bar
- Person search to center tree (in controls bar)
- Star icon (★) on "me" card (set via "You in this tree" in settings)
- Non-blocking side panel with full person profile (avatar, timeline, stories, relationships, add-relative shortcuts)
- Add-relative buttons on card hover (parent, child, sibling, spouse) — supports linking existing persons
- Children sorted by birth year
- Centered person highlighted with primary-color halo
- Graph styling configurable in tree settings with live preview (shared `buildCardHtml`)

### Date display

All dates go through `formatFlexDate(date, qualifier, date2, original)` in `frontend/src/lib/dates.ts`. Dates parsed with `new Date(year, month-1, day)` to avoid timezone offset bugs. Raw ISO strings are never displayed directly.

## Story Editor

Stories use **Lexical** (Meta's rich text editor framework):

- **Toolbar**: bold, italic, underline, strikethrough, H2/H3, blockquote, ordered/unordered lists, links, horizontal rules, image upload, file import, undo/redo
- **@mention**: typeahead for person tagging. Smart shortcuts (`@me`, `@dad`, `@mom`, `@siblings`, etc.) resolve via relationship graph when "You in this tree" is set. Person IDs extracted from content on save.
- **Inline images**: `ImageNode` (DecoratorNode) uploaded via `uploadMedia()`, rendered via `AuthImage`. Supports drag/drop, paste, and toolbar button.
- **Document import**: `.txt`, `.md` (converted via markdown transformers), `.docx` (via mammoth.js client-side)
- **Storage**: Lexical editor state as JSON in `stories.content` (TEXT column). Backward compatible — legacy plain text detected by absence of `{"root":` prefix.
- **Read-only**: `StoryRenderer` renders with person hover cards showing geocoded locations, dates, occupation.
- **Tags**: create/edit/delete with color picker, filterable in stories list.
- **Attachments**: non-image media (audio, video, documents) shown below story content.

## Map

The Map tab (`MapTab`) provides geographic visualization:

- **Dot markers**: blue (birth), gray (death), amber (story locations), green pin (searched person)
- **Layer toggles**: Birth, Death, Stories, Heatmap, Migration — each with colored indicator and count
- **Person search**: highlights all locations for a specific person
- **Legend**: bottom-left overlay showing active layer colors
- **Story locations**: resolved by matching `event_location` against the geocoding cache via `searchPlaces()`
- **Heatmap**: `leaflet.heat` with logarithmic scaling by person count
- **Migration lines**: dashed polylines between birth and death locations, weighted by person count

## GEDCOM Import

`POST /api/v1/trees/{id}/import/gedcom` accepts a multipart `.ged` file upload. The service (`app/services/gedcom.py`) uses `ged4py` to parse GEDCOM 5.5.1 files and bulk-creates Person and Relationship records.

Field mapping:

| GEDCOM tag | Person field |
|------------|-------------|
| `NAME/GIVN` | `given_name` |
| `NAME/SURN` | `family_name` |
| `NAME/_MARNM` | `maiden_name` (Heredis extension) |
| `SEX` | `gender` (M→male, F→female) |
| `BIRT/DATE` | `birth_date` + `birth_date_qualifier` + `birth_date_original` |
| `BIRT/PLAC` | `birth_location` |
| `DEAT/DATE` | `death_date` + qualifiers |
| `DEAT/PLAC` | `death_location` |
| `DEAT` present | `is_living = false` |
| `OCCU` | `occupation` |
| `EDUC` | `education` |
| `NATI` (all) | `nationalities` (JSON array) |
| `NOTE` (all) | `bio` (concatenated) |

FAM records create `spouse` relationships (with MARR/DIV dates as start/end) and `parent` relationships for each parent-child pair.
