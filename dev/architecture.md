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

```
/login                           → LoginPage
/register                        → RegisterPage
/dashboard                       → DashboardPage (tree list)
/trees/:treeId                   → TreeDetailPage (tabs: persons, relationships, stories, media, members)
/trees/:treeId/persons/:personId → PersonDetailPage
/trees/:treeId/stories/:storyId  → StoryDetailPage
/settings                        → SettingsPage
```

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

The family tree graph uses a two-library split:

| Concern | Library | Notes |
|---------|---------|-------|
| Layout (node positions) | `relatives-tree` | Couple-as-unit algorithm; outputs `left`/`top` grid coordinates |
| Rendering | React Flow (`@xyflow/react`) | Nodes, edges, zoom/pan, minimap, interactive handles |

### Why relatives-tree

Generic DAG layout engines (e.g., Dagre/Graphviz) treat every node independently. In a family tree, spouses must share the same generation level and children must descend from their midpoint — the "couple-as-unit" constraint. `relatives-tree` encodes this natively: each person's node lists `parents`, `children`, `spouses`, and `siblings` arrays, and the algorithm guarantees couples are co-ranked.

Graphviz WASM (the algorithm Gramps uses) was considered but rejected: ~3MB bundle, loading latency, and marginal quality gain over `relatives-tree` for typical genealogy trees.

### Data flow

```
Person[] + Relationship[]
  → toRelNodes()          # map to relatives-tree Node format
  → calcTree(nodes, { rootId })   # layout: outputs ExtNode[] with left/top
  → x = left * (NODE_W + HGAP)   # scale to pixel coordinates
    y = top  * (NODE_H + VGAP)
  → React Flow nodes[]    # rendered as PersonNode components
  → React Flow edges[]    # parent/spouse/partner edges from Relationship[]
```

### Root person

`relatives-tree` requires a `rootId` — the person the tree is centred on. Default: the person with no defined parents (oldest ancestor). Users can re-centre via "Center tree on this person" in the person detail panel. Disconnected nodes (not reachable from the root through the relationship graph) are hidden from the graph view but accessible via the Persons tab.

### Date display

All dates go through `formatFlexDate(date, qualifier, date2, original)` in `frontend/src/lib/dates.ts`. This converts the flexible date model (qualifier + optional range) to human-readable strings: "circa 1950", "before 1960", "1910 – 1920", etc. Raw ISO strings are never displayed directly.

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
