# TellingTree — API Specification

Base URL: `/api/v1`

All endpoints return JSON. Protected endpoints require `Authorization: Bearer <token>` header.

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | No | Create user account |
| POST | /auth/login | No | Get JWT access + refresh tokens |
| POST | /auth/refresh | Yes (refresh) | Get new access token |
| POST | /auth/logout | No | Clear refresh cookie |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /users/me | Yes | Get current user profile |
| PUT | /users/me | Yes | Update profile (full_name, email) |
| PUT | /users/me/password | Yes | Change password (requires current_password + new_password). Revokes all existing tokens. |
| DELETE | /users/me | Yes | Delete account (requires password). Blocked if user owns trees. |

## Trees

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees | Yes | — | List user's trees (owned + shared) |
| POST | /trees | Yes | — | Create new tree |
| GET | /trees/:tree_id | Yes | viewer+ | Get tree details |
| PUT | /trees/:tree_id | Yes | admin | Update tree metadata |
| DELETE | /trees/:tree_id | Yes | owner | Delete tree and all data |
| PUT | /trees/:tree_id/transfer | Yes | owner | Transfer ownership to an existing member |
| GET | /trees/:tree_id/search?q= | Yes | viewer+ | Search persons and stories (min 2 chars) |

Note: `GET /trees/:tree_id` accepts tree slug or UUID.

## Tree Members

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees/:tree_id/members | Yes | viewer+ | List tree members |
| POST | /trees/:tree_id/members | Yes | admin | Invite user to tree |
| PUT | /trees/:tree_id/members/:user_id | Yes | admin | Update member role |
| DELETE | /trees/:tree_id/members/:user_id | Yes | admin | Remove member |

## Persons

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees/:tree_id/persons | Yes | viewer+ | List persons (paginated) |
| POST | /trees/:tree_id/persons | Yes | editor+ | Create person |
| GET | /trees/:tree_id/persons/:person_id | Yes | viewer+ | Get person details |
| PUT | /trees/:tree_id/persons/:person_id | Yes | editor+ | Update person |
| DELETE | /trees/:tree_id/persons/:person_id | Yes | editor+ | Soft-delete person |
| GET | /trees/:tree_id/persons/:person_id/network | Yes | viewer+ | Get all connected persons (BFS) |
| POST | /trees/:tree_id/persons/:person_id/merge | Yes | editor+ | Merge another person into this one |

## Relationships

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees/:tree_id/relationships | Yes | viewer+ | List all relationships |
| POST | /trees/:tree_id/relationships | Yes | editor+ | Create relationship |
| GET | /trees/:tree_id/relationships/:rel_id | Yes | viewer+ | Get relationship |
| PUT | /trees/:tree_id/relationships/:rel_id | Yes | editor+ | Update relationship |
| DELETE | /trees/:tree_id/relationships/:rel_id | Yes | editor+ | Delete relationship |
| GET | /trees/:tree_id/persons/:person_id/relationships | Yes | viewer+ | Get person's relationships |

## Stories

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees/:tree_id/stories | Yes | viewer+ | List stories (filterable by tag, person, date) |
| POST | /trees/:tree_id/stories | Yes | editor+ | Create story |
| GET | /trees/:tree_id/stories/:story_id | Yes | viewer+ | Get story with media and persons |
| PUT | /trees/:tree_id/stories/:story_id | Yes | editor+ | Update story |
| DELETE | /trees/:tree_id/stories/:story_id | Yes | editor+ | Delete story |
| POST | /trees/:tree_id/stories/:story_id/persons/:person_id | Yes | editor+ | Link person to story |
| DELETE | /trees/:tree_id/stories/:story_id/persons/:person_id | Yes | editor+ | Unlink person from story |
| POST | /trees/:tree_id/stories/:story_id/tags/:tag_id | Yes | editor+ | Tag a story |
| DELETE | /trees/:tree_id/stories/:story_id/tags/:tag_id | Yes | editor+ | Untag a story |

## Media

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | /trees/:tree_id/media | Yes | editor+ | Upload media file (multipart) |
| GET | /trees/:tree_id/media/:media_id | Yes | viewer+ | Get media metadata |
| GET | /trees/:tree_id/media/:media_id/download | Yes | viewer+ | Download file |
| DELETE | /trees/:tree_id/media/:media_id | Yes | editor+ | Delete media |

## Tags

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | /trees/:tree_id/tags | Yes | viewer+ | List tags |
| POST | /trees/:tree_id/tags | Yes | editor+ | Create tag |
| PUT | /trees/:tree_id/tags/:tag_id | Yes | editor+ | Update tag |
| DELETE | /trees/:tree_id/tags/:tag_id | Yes | editor+ | Delete tag |

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Service health check |

## Common Patterns

### Pagination
Query params: `?skip=0&limit=20` (default limit=20, max limit=10000)

Response:
```json
{
  "items": [...],
  "total": 150,
  "skip": 0,
  "limit": 20
}
```

### Error Responses
```json
{
  "detail": "Human-readable error message"
}
```

Standard HTTP status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 422 (validation error).

### Media Upload
`Content-Type: multipart/form-data` with file field. Max file size: 500MB. Allowed MIME types: image/*, audio/*, video/*, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.*.

## Import

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | /trees/:tree_id/import/gedcom | Yes | editor+ | Import GEDCOM 5.5.1 file |

Request: `multipart/form-data` with `file` field (`.ged` / `.gedcom`).
Response: `{ persons_created, relationships_created, skipped, errors[] }`.
Note: additive import — no deduplication. Running twice creates duplicates.

## Places

Global geocoding cache (not tree-scoped). Places are shared across trees.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /places/search?q=… | Yes | Search local cache + geocode on miss (min 2 chars) |
| POST | /places | Yes | Create a place manually |
| GET | /places/:place_id | Yes | Get a single place |
| PUT | /places/:place_id | Yes | Update a place (e.g. fix wrong geocode) — sets geocoder="manual" |
| DELETE | /places/:place_id | Yes | Delete; unlinks birth_place_id/death_place_id from all persons |
| GET | /trees/:tree_id/places | Yes | viewer+ | List all places referenced by persons in this tree |
| GET | /trees/:tree_id/places/details | Yes | viewer+ | List places with associated person info (name, field) |
| POST | /trees/:tree_id/places/geocode-all | Yes | editor+ | Batch geocode all unlinked raw locations (NDJSON stream) |
| POST | /trees/:tree_id/places/reset-geocoding | Yes | editor+ | Unlink all place FKs from persons in this tree (raw strings preserved) |

`GET /places/search` response: array of PlaceResponse objects `{ id, display_name, city, region, country, country_code, lat, lon, osm_id, osm_type, place_type, geocoder, geocoded_at, created_at }`.

Geocoding: search hits the local DB first (ILIKE on display_name). On a miss it calls Nominatim, stores the result with `geocoder="nominatim"`, and returns it. The browser never calls Nominatim directly — rate limiting is server-side (1 req/sec, thread-safe). Sub-locality fields (hamlet, suburb, neighbourhood, quarter) are parsed and included in `display_name` when present. Coordinate deduplication threshold: 0.001° (~111m).

## Trash (Soft-Delete)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /trees/:tree_id/trash | Yes | admin+ | List soft-deleted persons and stories |
| POST | /trees/:tree_id/trash/persons/:id/restore | Yes | admin+ | Restore a soft-deleted person |
| DELETE | /trees/:tree_id/trash/persons/:id | Yes | admin+ | Permanently delete a person |
| POST | /trees/:tree_id/trash/stories/:id/restore | Yes | admin+ | Restore a soft-deleted story |
| DELETE | /trees/:tree_id/trash/stories/:id | Yes | admin+ | Permanently delete a story |

Deleting a person or story via the standard DELETE endpoint sets `deleted_at` instead of removing the record. Soft-deleted records are excluded from all list/get queries.

## Audit Logging

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /trees/:tree_id/audit | Yes | admin+ | List recent audit log entries (default: 50, max: 200) |

Audit entries are created automatically for person create/update/delete actions. Each entry includes: `action`, `entity_type`, `entity_id`, `details` (JSON), `user_id`, `created_at`.

## GEDCOM Export

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /trees/:tree_id/export/gedcom | Yes | viewer+ | Download tree as GEDCOM 5.5.1 file |

## Invitations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /trees/:tree_id/invites | Yes | admin+ | Create an invite link (role, expiry in days) |
| GET | /trees/:tree_id/invites | Yes | admin+ | List active (unused, unexpired) invites |
| DELETE | /trees/:tree_id/invites/:id | Yes | admin+ | Revoke an invite |
| GET | /invite/:token | Yes | any | Get invite info (tree name, role, expiry) |
| POST | /invite/:token/accept | Yes | any | Accept invite and join the tree |
