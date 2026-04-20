export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  trees: {
    all: () => ["trees"] as const,
    detail: (id: string) => ["trees", id] as const,
    members: (id: string) => ["trees", id, "members"] as const,
  },
  persons: {
    // Paginated listing (PersonsTab) — invalidation anchor for all sub-keys
    all:  (treeId: string) => ["trees", treeId, "persons"] as const,
    // Full unbounded fetch (GraphTab, PersonDetailPage name resolution)
    // Prefix ["trees", treeId, "persons"] means invalidating `all()` covers this too.
    full: (treeId: string) => ["trees", treeId, "persons", "full"] as const,
    // Count-only fetch (header stats) — limit=1, just needs `.total`
    stat: (treeId: string) => ["trees", treeId, "persons", "stat"] as const,
    detail:  (treeId: string, id: string) => ["trees", treeId, "persons", id] as const,
    network: (treeId: string, personId: string) =>
      ["trees", treeId, "persons", personId, "network"] as const,
  },
  relationships: {
    // Paginated listing (RelationshipsTab) — invalidation anchor
    all:  (treeId: string) => ["trees", treeId, "relationships"] as const,
    // Full unbounded fetch (GraphTab)
    full: (treeId: string) => ["trees", treeId, "relationships", "full"] as const,
    detail: (treeId: string, id: string) =>
      ["trees", treeId, "relationships", id] as const,
    forPerson: (treeId: string, personId: string) =>
      ["trees", treeId, "persons", personId, "relationships"] as const,
  },
  stories: {
    all:      (treeId: string) => ["trees", treeId, "stories"] as const,
    stat:     (treeId: string) => ["trees", treeId, "stories", "stat"] as const,
    detail:   (treeId: string, id: string) => ["trees", treeId, "stories", id] as const,
    byPerson: (treeId: string, personId: string) =>
      ["trees", treeId, "stories", "by-person", personId] as const,
  },
  media: {
    all:    (treeId: string) => ["trees", treeId, "media"] as const,
    detail: (treeId: string, id: string) => ["trees", treeId, "media", id] as const,
  },
  tags: {
    all: (treeId: string) => ["trees", treeId, "tags"] as const,
  },
  places: {
    search:  (q: string)      => ["places", "search", q]  as const,
    detail:  (id: string)     => ["places", id]            as const,
    forTree: (treeId: string) => ["trees", treeId, "places"] as const,
  },
};
