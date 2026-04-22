# TellingTree — Data Model

## How the Database Fits Together

TellingTree's database is built around one central idea: **everything belongs to a tree**. A tree is a family unit — it contains persons, their relationships, the stories told about them, media files, and tags for organizing it all. Users own and collaborate on trees. **Places** are global (not tree-scoped) and act as a geocoding cache that persons reference.

### The Core Loop

```
User ──creates──> Tree ──contains──> Persons ──connected by──> Relationships
                   │                    │  │
                   │                    │  └──born/died in──> Places (geocoded, global)
                   │                    │
                   │                    └──featured in──> Stories ──organized by──> Tags
                   │                                        │
                   └──stores──────────> Media <──attached to─┘
```

---

## Tables in Detail

### users

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Login identifier, validated format |
| username | VARCHAR(100) | Display handle, alphanumeric + dash/underscore |
| password_hash | VARCHAR(255) | Bcrypt hash |
| full_name | VARCHAR(255) | Optional display name |
| is_active | BOOLEAN | False = account deactivated |
| token_version | INTEGER | Incremented on password change to revoke all tokens |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | Auto-updated |

- A user can own multiple trees and be a member of others' trees
- Deleting a user requires transferring all owned trees first
- `token_version` is embedded in JWTs — changing password invalidates all sessions

---

### trees

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| owner_id | UUID | FK → users |
| name | VARCHAR(255) | |
| description | TEXT | Optional |
| is_public | BOOLEAN | If true, no login needed for reads |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Deleting a tree cascades to all its persons, stories, relationships, media, and tags.

---

### tree_members

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees |
| user_id | UUID | FK → users |
| role | VARCHAR(20) | `viewer`, `editor`, or `admin` |
| created_at | TIMESTAMPTZ | |

**Constraint:** UNIQUE(tree_id, user_id)

Role hierarchy: `viewer` → read-only · `editor` → create/update/delete data · `admin` → manage members · `owner` (tree.owner_id) → full control

---

### persons
An individual in the family tree. All fields except `tree_id` are optional.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees |
| given_name | VARCHAR(255) | First name |
| family_name | VARCHAR(255) | Last name |
| maiden_name | VARCHAR(255) | Birth surname before marriage |
| nickname | VARCHAR(100) | "Also known as" / common name |
| birth_date | DATE | Primary birth date (start of range for "between") |
| birth_date_qualifier | VARCHAR(20) | `exact` `year-only` `about` `before` `after` `between` `estimated` `calculated` |
| birth_date_2 | DATE | End of range — only set when qualifier is `between` |
| birth_date_original | VARCHAR(50) | Raw original string (e.g. "ABT 1850") for round-trips |
| death_date | DATE | Same structure as birth_date |
| death_date_qualifier | VARCHAR(20) | Same values as birth_date_qualifier |
| death_date_2 | DATE | End of range if qualifier is `between` |
| death_date_original | VARCHAR(50) | Raw original string |
| birth_location | VARCHAR(255) | Raw location text (historical name preserved) |
| birth_place_id | UUID | FK → places (nullable, SET NULL on delete) |
| death_location | VARCHAR(255) | Raw location text |
| death_place_id | UUID | FK → places (nullable, SET NULL on delete) |
| gender | VARCHAR(50) | Free-text: "male", "female", "unknown" |
| is_living | BOOLEAN | NULL = unknown; true = living; false = deceased |
| occupation | VARCHAR(255) | Primary/last occupation |
| nationalities | JSON | Array of strings e.g. `["Italian", "Swiss"]` |
| education | TEXT | Free-text education history |
| bio | TEXT | Short biography |
| profile_picture_id | UUID | FK → media (nullable, SET NULL on delete) |
| deleted_at | TIMESTAMPTZ | NULL = active; set = soft-deleted (visible in Trash) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | Auto-updated |

**Soft-delete:** when a person is deleted via the API, `deleted_at` is set to the current timestamp. The record is excluded from all list/get queries but remains in the database. Admins can restore or permanently delete from the Trash tab.

**Flexible date model:** the `birth_date` column holds the primary date; `birth_date_qualifier` records certainty (`exact`, `about`, `before`, etc.); `birth_date_2` holds the end bound for `between` ranges; `birth_date_original` preserves the raw source string (e.g. from GEDCOM) for display and round-tripping.

**Location duality:** `birth_location` stores the raw historical text as written in the source (genealogy values); `birth_place_id` links to a geocoded Place record when available. Both can exist simultaneously.

---

### places
Global geocoding cache. Not scoped to any tree — the same place can be referenced by persons across multiple trees.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| display_name | VARCHAR(500) | Canonical display string: "Mendrisio, Ticino, Switzerland" |
| city | VARCHAR(200) | Parsed city/municipality component |
| region | VARCHAR(200) | State, canton, county, etc. |
| country | VARCHAR(100) | Full country name |
| country_code | CHAR(2) | ISO 3166-1 alpha-2: "CH", "IT", "DE" |
| lat | FLOAT | WGS-84 latitude |
| lon | FLOAT | WGS-84 longitude |
| geocoder | VARCHAR(50) | Source: `nominatim`, `manual`, etc. |
| geocoded_at | TIMESTAMPTZ | When geocoded (null for manually created) |
| created_at | TIMESTAMPTZ | |

**Search flow:** `GET /places/search?q=…` first queries this table (ILIKE); on a cache miss it calls Nominatim, stores the result, and returns it. All geocoding goes through the backend — the browser never calls Nominatim directly.

---

### relationships
A typed connection between two persons.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees |
| person_a_id | UUID | FK → persons |
| person_b_id | UUID | FK → persons |
| relationship_type | VARCHAR(100) | Free text: "parent", "spouse", "partner", "godparent", etc. |
| start_date | DATE | When the relationship began (e.g., marriage date) |
| end_date | DATE | When it ended (e.g., divorce date) |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Constraint:** CHECK(person_a_id != person_b_id)

**Auto-inverse:** The API automatically creates a mirrored record for symmetric types. When you create `A → parent → B`, the API also creates `B → child → A`. Both records carry the same `start_date`, `end_date`, and `notes`. When you delete one, the other is deleted too.

**Primary types recognized by the frontend:**
- `parent` / `child` (directional, auto-inversed)
- `spouse` (mutual, with optional marriage dates)
- `partner` (mutual, for non-married couples)

Custom types (godparent, mentor, caretaker, etc.) are accepted and stored — the frontend just won't apply special visual treatment to them.

---

### stories

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees |
| title | VARCHAR(255) | |
| content | TEXT | Story body |
| event_date | DATE | When the story happened |
| event_end_date | DATE | For stories spanning a range |
| event_location | VARCHAR(255) | |
| author_id | UUID | FK → users |
| deleted_at | TIMESTAMPTZ | NULL = active; set = soft-deleted |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Stories are linked to persons via `story_persons` (many-to-many) and tagged via `story_tags` (many-to-many).

---

### media

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees |
| story_id | UUID | FK → stories (nullable) |
| person_id | UUID | FK → persons (nullable) |
| uploaded_by_id | UUID | FK → users |
| filename | VARCHAR(255) | UUID-based filename on disk |
| original_filename | VARCHAR(255) | Original upload name |
| mime_type | VARCHAR(100) | |
| size_bytes | BIGINT | |
| storage_path | VARCHAR(500) | Relative path, resolved at runtime |
| media_type | VARCHAR(20) | `photo` `audio` `video` `document` `other` |
| caption | TEXT | |
| created_at | TIMESTAMPTZ | |

`storage_path` is relative; resolved via `resolve_path()` in `app/services/storage.py`.

---

### tags / story_tags / story_persons

Standard many-to-many junction tables. Tags have `name` + `color` and are scoped to a tree. Unique constraints prevent duplicates.

---

## Cascade Rules

| Deleted | Cascades to |
|---------|-------------|
| **Tree** | All persons, relationships, stories, media (files on disk), tags, members |
| **Person** | Their relationships, story_person links, media; place FKs set to NULL |
| **Story** | story_person links, story_tag links, media (files on disk) |
| **Place** | persons.birth_place_id / death_place_id set to NULL (place record deleted, persons kept) |
| **Tag** | story_tag links |
| **User** | tree_memberships (must transfer owned trees first) |

---

## Indexes

| Index | Purpose |
|-------|---------|
| users(email), users(username) | Fast login lookups |
| persons(tree_id) | List persons by tree |
| persons(birth_place_id), persons(death_place_id) | Place lookups |
| persons(profile_picture_id) | Profile picture lookup |
| places(display_name) | Local place search (ILIKE) |
| relationships(tree_id), (person_a_id), (person_b_id) | Relationship queries |
| stories(tree_id), stories(author_id) | Story listing |
| media(tree_id), (story_id), (person_id) | Media lookups |

---

## Design Principles

1. **UUIDs everywhere** — all primary keys. URL-safe, no information leakage.
2. **Tree-scoped** — every piece of data except `places` belongs to exactly one tree.
3. **Places are global** — the geocoding cache is shared across trees; same place geocoded once.
4. **Flexible by default** — relationship types, gender, and tags are free-text. No rigid enums.
5. **Location duality** — raw string (`birth_location`) + geocoded FK (`birth_place_id`) coexist, preserving historical fidelity while enabling map features.
6. **Flexible dates** — qualifier + range columns alongside the primary Date column handle GEDCOM-style approximate dates without losing sortability.
7. **Cascade carefully** — deleting a tree cleans up everything. Deleting a place unlinks persons gracefully.
8. **Timestamps are timezone-aware** — all `TIMESTAMPTZ`, always UTC.
9. **Soft-delete** — persons and stories use `deleted_at` instead of hard delete. Restorable by admins.

### audit_logs

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees (CASCADE) |
| user_id | UUID | FK → users (SET NULL) |
| action | VARCHAR(20) | create, update, delete, restore |
| entity_type | VARCHAR(50) | person, story, relationship, etc. |
| entity_id | UUID | The affected record's ID |
| details | JSON | Additional context (field names, old values) |
| created_at | TIMESTAMPTZ | When the action occurred |

### tree_invites

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| tree_id | UUID | FK → trees (CASCADE) |
| role | VARCHAR(20) | Role granted on acceptance (viewer/editor/admin) |
| token | VARCHAR(64) | Unique, URL-safe invite token |
| created_by | UUID | FK → users (SET NULL) |
| expires_at | TIMESTAMPTZ | When the invite expires |
| used_by | UUID | FK → users — set when accepted |
| used_at | TIMESTAMPTZ | When it was accepted |
| created_at | TIMESTAMPTZ | |
