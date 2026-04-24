# TellingTree Audit Report

**Date**: 2026-04-21
**Scope**: Full codebase sweep — frontend, backend, documentation, configuration

---

## Executive Summary

TellingTree is a solid MVP with strong core features: family tree visualization (family-chart), GEDCOM import with streaming progress, geocoding with heatmap, and a clean tab-based UI. The main gaps are UX polish (validation feedback, toast notifications), missing features (media gallery, GEDCOM export, profile pictures), and production hardening (audit logging, soft-delete, file upload validation).

---

## 1. Dashboard (Home Page)

**File**: `frontend/src/pages/DashboardPage.tsx`

**Current state**: Tree list with cards, "New Tree" dialog with optional GEDCOM import.

| Issue | Priority | Notes |
|-------|----------|-------|
| No success toast after tree creation | Medium | User gets navigated but no confirmation |
| Empty state is plain text | Low | Could have illustration or tutorial link |
| No tree sorting (alphabetical, recent, size) | Medium | Becomes important with many trees |
| No tree search | Medium | Same — scales poorly |
| Tree cards show no stats (people count, etc.) | Medium | Would help users identify trees |

---

## 2. Sidebar

**File**: `frontend/src/components/layout/Sidebar.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No tree search/filter | Medium | Unusable with 10+ trees |
| Tree names truncate without tooltip | Low | Full name not visible |
| No "create tree" shortcut | Low | Must go to dashboard |
| No active tree indicator beyond URL | Low | Which tree am I working on? |

---

## 3. Settings / Profile

**File**: `frontend/src/pages/SettingsPage.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No profile picture upload | Medium | Users have no avatar |
| No active sessions view | Low | Can't log out other devices |
| Account deletion doesn't show which trees need transfer | Medium | User confusion |
| No email change confirmation flow | Medium | Security concern |

---

## 4. Tree Detail Page

**File**: `frontend/src/pages/tree/TreeDetailPage.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No GEDCOM export | Medium | Common genealogy feature |
| No "share tree" button in header | Low | Only in settings |
| Tab overflow has no scroll indicator | Low | Users may not notice hidden tabs |
| No keyboard tab navigation | Low | Accessibility |

---

## 5. Person Detail Page

**File**: `frontend/src/pages/tree/PersonDetailPage.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No profile picture upload | Medium | Can only link existing media |
| "Maiden name" assumes gender | Low | Should be "Birth name" universally |
| No quick navigation to related persons | Medium | Click parent/spouse → go to their page |
| Bio is plain text (no formatting) | Low | Markdown would be nice |
| No data completeness indicator | Low | "This person is 40% complete" |

---

## 6. Stories

**Files**: `StoriesTab.tsx`, `StoryDetailPage.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No story search | Medium | Can't find stories by title/content |
| No "linked people" display | Medium | Which people are in this story? |
| No media attachment UI | Medium | Backend supports it, frontend doesn't |
| Plain textarea editor | Low | No formatting toolbar |
| No read time / word count | Low | Polish |

---

## 7. Media

**File**: `frontend/src/components/tree/MediaTab.tsx`

| Issue | Priority | High |
|-------|----------|------|
| No gallery view | High | Just an upload button, can't see uploaded files |
| No media organization | High | No tags, no person/story linking UI |
| No image preview | High | Must download to view |

---

## 8. Graph View

**File**: `frontend/src/components/tree/GraphTab.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| 591 lines — could split into sub-components | Low | Maintainability |
| Not tested with 1000+ persons | Medium | Performance unknown |
| MutationObserver for path z-order could leak | Low | Should disconnect on cleanup |
| No "fit to screen" button | Low | Must zoom manually |

---

## 9. Relationships

**File**: `frontend/src/components/tree/RelationshipsTab.tsx`

| Issue | Priority | Notes |
|-------|----------|-------|
| No bulk operations | Low | Can't delete multiple relationships |
| No relationship timeline visualization | Low | When did marriages start/end? |
| Can create impossible relationships (parent + spouse of same person) | Medium | Backend validation gap |

---

## 10. Backend

### Validation Gaps

| Issue | Priority | Notes |
|-------|----------|-------|
| Person names can be empty/whitespace | Medium | Should trim and reject |
| No `death_date >= birth_date` check | Medium | Allows impossible dates |
| No relationship end_date >= start_date check | Low | |
| No file upload size/type validation | High | DoS risk |
| Story title can be empty | Low | |

### Missing Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Soft-delete (persons, stories) | High | Deletions are permanent |
| Audit logging | Medium | No record of who changed what |
| GEDCOM export | Medium | Can import but not export |
| Email verification on registration | Medium | Anyone can register with any email |
| Rate limiting on uploads | High | Only auth endpoints are rate-limited |

---

## 11. Documentation

| Doc | Status | Notes |
|-----|--------|-------|
| `CLAUDE.md` | Good | Up to date, minor gaps (deployment checklist) |
| `README.md` | Good | Clear features, quick start |
| `dev/decisions.md` | Excellent | Design rationale documented |
| `dev/architecture.md` | Good | Needs update for family-chart |
| `dev/api-spec.md` | Good | Missing cURL examples |

---

## 12. Configuration

| Issue | Priority | Notes |
|-------|----------|-------|
| `entitree-flex` still in package.json | Low | Unused, can remove |
| `@hookform/resolvers` may be unused | Low | Check and remove |
| `sonner` (toast lib) is installed but never used | Medium | Should implement toasts |
| No pre-commit hooks for linting | Low | Code quality |

---

## 13. Architecture Suggestions

### Settings Organization

Current: Global settings page + tree-specific manage page. Proposed:

```
User Settings (gear icon in sidebar)
├── Profile (name, email, avatar, password)
├── Preferences (language, date format, default theme)
└── Security (sessions, 2FA, delete account)

Tree Settings (per tree, accessible from tree header)
├── General (name, description, members)
├── Graph (navigation, layout, colors — with live preview)
├── Data (import GEDCOM, export, geocoding tools)
└── Danger Zone (delete tree)
```

### Sidebar Enhancement

```
Sidebar
├── Dashboard (home icon)
├── ─── separator ───
├── Trees (collapsible section)
│   ├── [search input if > 5 trees]
│   ├── Tree A (with people count badge)
│   ├── Tree B
│   └── + New Tree
├── ─── separator ───
├── Settings (gear icon)
└── User avatar + logout
```

---

## 14. Priority Roadmap

### Now (Quick Wins)
- [x] Implement toast notifications using sonner — added to all 10 mutation files
- [x] Remove unused npm dependencies — removed `entitree-flex`, `@hookform/resolvers`
- [x] Add form validation feedback — unified AddPersonDialog with red borders on empty names
- [x] Fix MutationObserver cleanup in GraphTab — stored in ref, disconnected on cleanup
- [x] Add file upload size validation — 50MB GEDCOM, 100MB media, checked frontend + backend

### Next Sprint
- [x] Build media gallery in MediaTab — grid view with thumbnails, search, type filter, download, delete
- [x] Add story search — already implemented (title + content filter, sort options)
- [x] Add profile picture upload — click avatar on PersonDetailPage, uploads + sets profile_picture_id
- [x] Implement soft-delete with restore UI — deleted_at column, Trash tab with restore/permanent delete
- [x] Add GEDCOM export — full export service + endpoint + download button in settings
- [x] GEDCOM import: parse nicknames (NICK tag + embedded "quotes"/(parens)), de-capitalize ALL CAPS surnames
- [x] Add person name validation — trim whitespace, empty→None via model_validator
- [x] Add date ordering validation — death >= birth on Person, end >= start on Relationship
- [x] Unified AddPersonDialog — extracted to common, consistent across Graph and People tab
- [x] Extracted QualifierSelect to common — removed duplication from GraphTab and PersonDetailPage
- [x] Sidebar tree search — filter input appears when > 5 trees
- [x] Relationship type validation — prevents parent+spouse conflicts

### Future
- [ ] Email verification flow
- [x] Audit logging — audit_logs table, log_action helper, person CRUD logged, admin-only view endpoint
- [x] Dark mode toggle — theme.ts + sidebar toggle (light/dark/system), family-chart dark CSS
- [x] Keyboard shortcuts — Cmd+K to focus search
- [x] Confirmation dialogs — ConfirmDialog component, added to person delete
- [x] 404 page — replaces silent redirect
- [x] GEDCOM export — done (export service + endpoint + download button)
- [x] Performance optimization — pre-indexed relationship lookups O(n+m) instead of O(n×m)
- [x] Mobile-first responsive pass — responsive grids, collapsible table columns, fluid search inputs, reduced padding
- [x] Invite members via shareable link — token-based invites with expiry, acceptance page, clipboard copy

---

## 15. Files Referenced

| Area | Key Files |
|------|-----------|
| Dashboard | `frontend/src/pages/DashboardPage.tsx` |
| Sidebar | `frontend/src/components/layout/Sidebar.tsx` |
| Layout | `frontend/src/components/layout/Layout.tsx` |
| Tree Detail | `frontend/src/pages/tree/TreeDetailPage.tsx` |
| Graph | `frontend/src/components/tree/GraphTab.tsx` |
| Person | `frontend/src/pages/tree/PersonDetailPage.tsx` |
| Stories | `frontend/src/components/tree/StoriesTab.tsx`, `StoryDetailPage.tsx` |
| Media | `frontend/src/components/tree/MediaTab.tsx` |
| Places | `frontend/src/components/tree/PlacesTab.tsx`, `PlacesMap.tsx` |
| Relationships | `frontend/src/components/tree/RelationshipsTab.tsx` |
| Settings | `frontend/src/pages/SettingsPage.tsx` |
| Tree Manage | `frontend/src/pages/tree/TreeManagePage.tsx` |
| Auth | `frontend/src/pages/auth/LoginPage.tsx`, `RegisterPage.tsx` |
| Graph Settings | `frontend/src/lib/graphSettings.ts` |
| Routing | `frontend/src/App.tsx` |
| GEDCOM | `app/services/gedcom.py` |
| Geocoding | `app/services/geocoding.py` |
| Places API | `app/api/v1/places.py` |
| Imports API | `app/api/v1/imports.py` |

---

## Audit 2 — 2026-04-23

**Scope**: Deep code audit — backend correctness, frontend cache coherence, memory leaks, query patterns.

### Backend

#### High

| # | File | Issue | Impact |
|---|------|-------|--------|
| B1 | `app/api/v1/relationships.py:95–114` | Inverse relationship creation is non-atomic — two simultaneous A→B / B→A requests both see no inverse and both create one | Duplicate inverse relationships; corrupted graph |
| B2 | `app/api/v1/persons.py:261–270` | Person merge runs 1001+ individual queries (N+1) instead of a bulk update; not wrapped in a transaction | Data corruption under concurrent edits; severe slowdown on large trees |
| B3 | `app/api/v1/media.py:21–29` | `list_media` loads ALL files with `.all()` — no limit or offset | Memory exhaustion as media library grows |
| B4 | `app/api/v1/deps.py:6` | `limit` param accepts up to 50,000; any endpoint can be called with `?limit=50000` to load the full dataset | Potential OOM / DOS via resource exhaustion |
| B5 | `app/api/v1/trees.py:204–228` | `update_member` accepts any string for `role`; relies on DB constraint instead of API-layer validation | 500 errors instead of 400 on invalid role values |

#### Medium

| # | File | Issue | Impact |
|---|------|-------|--------|
| B6 | `app/api/v1/places.py:38–56` | Substring `ILIKE` (`%query%`) cannot use B-tree index — full table scan on every place search | Query time degrades linearly with place count |
| B7 | `app/api/v1/places.py:281–362` | Batch geocoding streaming endpoint creates its own DB session; session leaks if an exception occurs before `.close()` | DB connection pool exhaustion over time |

### Frontend

#### High

| # | File | Issue | Impact |
|---|------|-------|--------|
| F1 | `frontend/src/pages/tree/TreeDetailPage.tsx:50,53` | Dashboard uses `queryKeys.stories.stat()` but `StoriesTab` invalidates `queryKeys.stories.all()` — mismatched keys mean story count never refreshes after create/delete | Dashboard story count is permanently stale |
| F2 | `frontend/src/components/tree/MembersTab.tsx:46–70` | `useEffect` debounce timeout fires after component unmounts, calling `setState` on an unmounted component | Memory leak warning in dev; stale state update |

#### Medium

| # | File | Issue | Impact |
|---|------|-------|--------|
| F3 | `frontend/src/components/tree/StoriesTab.tsx:116–123` | `createMut` only invalidates `stories.all()`, not `stories.byPerson()` | Person's story list is stale after a new story is created |
| F4 | `frontend/src/components/tree/PersonsTab.tsx:53–56` | Fetches up to 50,000 persons client-side for filtering/pagination | High memory and bandwidth cost on large trees |
| F5 | `frontend/src/components/tree/StoriesTab.tsx:67–80` | Fetches 50,000 persons + relationships + 10,000 stories client-side | Same as above; compounded by multiple large fetches |

### Fix status

| # | Status | Notes |
|---|--------|-------|
| B1 | Fixed | Forward + inverse now in single transaction; `UniqueConstraint` added; `IntegrityError` caught and surfaced as 400 |
| B2 | Pending | |
| B3 | Pending | |
| B4 | Pending | |
| B5 | False positive | `TreeMemberUpdate` already has `Field(pattern=...)` — FastAPI returns 422 on invalid role |
| B6 | Pending | |
| B7 | Pending | |
| F1 | False positive | TanStack Query prefix matching: invalidating `stories.all` key already covers `stories.stat` |
| F2 | Fixed | Added `cancelled` flag + cleanup return to prevent setState on unmounted component |
| F3 | False positive | Same prefix matching as F1 — `stories.all` key covers `stories.byPerson` |
| F4 | Pending | |
| F5 | Pending | |
