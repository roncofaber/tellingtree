# TellingTree

An open-source genealogy application focused on **storytelling and memories** — not just names and dates. Build your family tree, write stories about the people in it, attach photos and audio, and share it with your family.

## Features

- **Interactive family graph** — visualise your entire tree at once, centred on any person, with configurable depth (powered by `relatives-tree` + React Flow)
- **GEDCOM import** — import from Heredis, Gramps, Ancestry, FamilySearch, or any GEDCOM 5.5.1-compatible software
- **Flexible dates** — handles genealogy-style dates: exact, circa, before/after, between ranges, year-only (`ABT 1850`, `BEF 1900`, etc.)
- **Full person profiles** — given name, surname, maiden name, nickname, occupation, nationalities, education, bio, profile picture
- **Stories** — rich narratives linked to one or more people, with events, dates, and locations
- **Media** — attach photos, audio recordings, video, and documents to stories or people
- **Places** — geocoded location database (via Nominatim / OpenStreetMap); link birth/death locations to canonical place records with coordinates
- **Tree sharing** — invite family members with fine-grained roles: viewer, editor, admin
- **Python SDK** — programmatic access to every API endpoint for scripting and data migration

## Quick Start

### Option A: Docker Compose (recommended)

```bash
git clone https://github.com/your-org/tellingtree
cd tellingtree

cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY for production

docker compose up
```

- API: **http://localhost:8000** — interactive docs at `/docs`
- Run migrations inside the container:
  ```bash
  docker compose exec app uv run alembic upgrade head
  ```

### Option B: Manual setup

**Prerequisites:** Python 3.11+, Node.js 20+, PostgreSQL 16

#### 1. Install Python dependencies

```bash
pip install uv
uv sync
```

#### 2. Set up PostgreSQL

```bash
# Ubuntu / WSL
sudo apt install -y postgresql
sudo service postgresql start

sudo -u postgres psql -c "CREATE USER tellingtree WITH PASSWORD 'tellingtree_dev_password';"
sudo -u postgres psql -c "CREATE DATABASE tellingtree_db OWNER tellingtree;"
```

#### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET_KEY to a random string in production
```

#### 4. Run database migrations

```bash
uv run alembic upgrade head
```

#### 5. Start the backend

```bash
uv run uvicorn app.main:app --reload
```

API available at **http://localhost:8000** — Swagger docs at **http://localhost:8000/docs**

#### 6. Start the frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Web app available at **http://localhost:5173**

---

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | local dev DB | Must use `postgresql+psycopg://` (psycopg v3) |
| `JWT_SECRET_KEY` | insecure dev key | **Change this in production** — app refuses to start if env=production and key is default |
| `ENVIRONMENT` | `development` | Set to `production` for stricter checks |
| `CORS_ORIGINS` | localhost ports | JSON list of allowed frontend origins |
| `STORAGE_PATH` | `storage/media` | Where uploaded files are stored on disk |
| `MAX_UPLOAD_SIZE_BYTES` | 500 MB | Max file upload size |

---

## Tests

```bash
uv run pytest tests/ -v
```

Tests use in-memory SQLite — no PostgreSQL needed. 78 tests covering persons, relationships, places, GEDCOM import, and more.

---

## GEDCOM Import

Import a `.ged` file exported from any genealogy software:

```bash
# Via the web UI: tree → Manage → Import GEDCOM

# Via API:
curl -X POST http://localhost:8000/api/v1/trees/{tree_id}/import/gedcom \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my_family.ged"
```

Supports: full names, maiden names, flexible dates (ABT/BEF/AFT/BET), locations, occupations, education, nationalities, notes, spouse/partner relationships with marriage dates, parent–child relationships.

---

## Python Client SDK

```python
from client import TellingTreeClient, ImportResult
from pathlib import Path

with TellingTreeClient("http://localhost:8000") as c:
    # Authenticate
    c.auth.register(email="me@example.com", username="me", password="secret123")
    c.auth.login(username="me", password="secret123")

    # Create a tree
    tree = c.trees.create(name="The Johnson Family")

    # Import from GEDCOM
    result: ImportResult = c.imports.gedcom(tree.id, Path("family.ged"))
    print(f"Imported {result.persons_created} people, {result.relationships_created} relationships")

    # Create a person with full fields
    person = c.persons.create(
        tree.id,
        given_name="Eleanor",
        family_name="Johnson",
        maiden_name="Smith",
        birth_date="1932-03-15",
        birth_date_qualifier="exact",
        birth_location="Boston, Massachusetts, USA",
        occupation="Schoolteacher",
        nationalities=["American"],
        bio="Remarkable woman who taught for 40 years.",
    )

    # Link a geocoded place
    places = c.places.search("Boston, Massachusetts")
    c.persons.update(tree.id, person.id, birth_place_id=places[0].id)

    # Write a story
    c.stories.create(
        tree.id,
        title="The Summer of '62",
        content="That year Eleanor...",
        event_date="1962-07-01",
        person_ids=[str(person.id)],
    )
```

---

## Project Structure

```
app/
  api/v1/         REST endpoints (persons, relationships, stories, media, places, imports, ...)
  models/         SQLAlchemy ORM models
  schemas/        Pydantic request/response schemas
  services/       Business logic (GEDCOM parsing, geocoding, file storage, permissions)
  core/           Auth, security, error handling, rate limiting
  db/             Database session and base

client/           Python SDK (mirrors every backend endpoint)

frontend/
  src/
    api/          TypeScript API client functions
    components/   Reusable UI components (graph, tabs, forms, ...)
    pages/        Route-level page components
    lib/          Utilities (date formatting, graph settings, query keys)
    types/        TypeScript interfaces

tests/            pytest suite (78 tests, uses in-memory SQLite)
dev/              Architecture docs, API spec, data model, design decisions log
alembic/          Database migration scripts
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16 |
| Auth | JWT (python-jose), bcrypt, HttpOnly refresh token cookie |
| GEDCOM parsing | ged4py |
| Geocoding | Nominatim (OpenStreetMap), server-side caching |
| Frontend | React 18, TypeScript, Vite, Shadcn/ui v4 (Base UI), TanStack Query v5 |
| Graph | React Flow + relatives-tree (couple-as-unit layout) |
| Package manager | uv (Python), npm (Node) |

---

## License

MIT
