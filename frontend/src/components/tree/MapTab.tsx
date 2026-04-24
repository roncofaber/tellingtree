import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTreePlaceDetails, listTreePlaces, searchPlaces } from "@/api/places";
import { listPersons } from "@/api/persons";
import { listStories } from "@/api/stories";
import { queryKeys } from "@/lib/queryKeys";
import { PlacesMap, type StoryMarker, type MapFilters } from "@/components/tree/PlacesMap";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { MapPin, Search, X } from "lucide-react";
import type { Place } from "@/types/place";

export function MapTab({ treeId }: { treeId: string }) {
  const [heatmap, setHeatmap] = useState(false);
  const [migration, setMigration] = useState(false);
  const [showBirth, setShowBirth] = useState(true);
  const [showDeath, setShowDeath] = useState(true);
  const [showStories, setShowStories] = useState(true);
  const [storyPlaceCache, setStoryPlaceCache] = useState<Map<string, { lat: number; lon: number } | null>>(new Map());

  // Person search
  const [personSearch, setPersonSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(null);
  const [highlightPersonName, setHighlightPersonName] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: placeDetails, isLoading: loadingPlaces } = useQuery({
    queryKey: queryKeys.places.forTreeDetails(treeId),
    queryFn: () => listTreePlaceDetails(treeId),
  });

  const { data: allPlaces } = useQuery({
    queryKey: queryKeys.places.forTree(treeId),
    queryFn: () => listTreePlaces(treeId),
  });

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const { data: storiesData, isLoading: loadingStories } = useQuery({
    queryKey: queryKeys.stories.all(treeId),
    queryFn: () => listStories(treeId, { limit: 10000 }),
  });

  const persons = personsData?.items ?? [];
  const geocoded = (placeDetails ?? []).filter(p => p.lat !== null && p.lon !== null);

  const filteredPersons = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return [];
    return persons
      .filter(p => [p.given_name, p.family_name].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [personSearch, persons]);

  // Story location resolving
  const unresolvedLocations = useMemo(() => {
    const locs: string[] = [];
    for (const s of storiesData?.items ?? []) {
      if (s.event_location && !storyPlaceCache.has(s.event_location)) {
        locs.push(s.event_location);
      }
    }
    return [...new Set(locs)];
  }, [storiesData, storyPlaceCache]);

  useEffect(() => {
    if (!showStories || unresolvedLocations.length === 0) return;
    let cancelled = false;
    const placesByName = new Map<string, Place>();
    for (const p of allPlaces ?? []) {
      if (p.lat !== null && p.lon !== null) placesByName.set(p.display_name.toLowerCase(), p);
    }

    (async () => {
      const updates = new Map<string, { lat: number; lon: number } | null>();
      for (const loc of unresolvedLocations) {
        if (cancelled) break;
        const exact = placesByName.get(loc.toLowerCase());
        if (exact) { updates.set(loc, { lat: exact.lat!, lon: exact.lon! }); continue; }
        try {
          const results = await searchPlaces(loc);
          const match = results.find(p => p.lat !== null && p.lon !== null);
          updates.set(loc, match ? { lat: match.lat!, lon: match.lon! } : null);
        } catch { updates.set(loc, null); }
      }
      if (!cancelled && updates.size > 0) {
        setStoryPlaceCache(prev => { const next = new Map(prev); for (const [k, v] of updates) next.set(k, v); return next; });
      }
    })();
    return () => { cancelled = true; };
  }, [unresolvedLocations, allPlaces, showStories]);

  const storyMarkers = useMemo((): StoryMarker[] => {
    if (!showStories) return [];
    const markers: StoryMarker[] = [];
    for (const s of storiesData?.items ?? []) {
      if (!s.event_location) continue;
      const coords = storyPlaceCache.get(s.event_location);
      if (coords) {
        markers.push({ id: s.id, title: s.title, lat: coords.lat, lon: coords.lon, location: s.event_location, year: s.event_date?.slice(0, 4) });
      }
    }
    return markers;
  }, [storiesData, storyPlaceCache, showStories]);

  if (loadingPlaces || loadingStories) return <LoadingSpinner />;

  if (geocoded.length === 0 && storyMarkers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No geocoded places yet.</p>
        <p className="text-xs text-muted-foreground">Add locations to people or geocode raw locations in Tree Settings.</p>
      </div>
    );
  }

  const toggleBtn = (active: boolean, onClick: () => void, label: string, dotColor?: string) => (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover:bg-muted"
      }`}
    >
      {dotColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? "#fff" : dotColor }} />}
      {label}
    </button>
  );

  const filters: MapFilters = { showBirth, showDeath, showStories, highlightPersonId };

  const birthCount = geocoded.filter(p => p.persons?.some(pr => pr.field === "birth")).length;
  const deathCount = geocoded.filter(p => p.persons?.some(pr => pr.field === "death")).length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {toggleBtn(showBirth, () => setShowBirth(b => !b), `Birth (${birthCount})`, "#3b82f6")}
          {toggleBtn(showDeath, () => setShowDeath(d => !d), `Death (${deathCount})`, "#6b7280")}
          {toggleBtn(showStories, () => setShowStories(s => !s), `Stories (${storyMarkers.length})`, "#f59e0b")}
          {toggleBtn(heatmap, () => setHeatmap(h => !h), "Heatmap")}
          {toggleBtn(migration, () => setMigration(m => !m), "Migration")}
        </div>

        {/* Person search */}
        <div ref={searchRef} className="relative">
          {highlightPersonId ? (
            <div className="flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {highlightPersonName}
              <button onClick={() => { setHighlightPersonId(null); setHighlightPersonName(null); }} className="ml-1 hover:text-emerald-900">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 bg-card rounded-md border px-2.5">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={personSearch}
                  onChange={e => { setPersonSearch(e.target.value); setSearchOpen(true); }}
                  onFocus={() => personSearch.trim() && setSearchOpen(true)}
                  placeholder="Find person…"
                  className="h-9 w-36 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {searchOpen && filteredPersons.length > 0 && (
                <div className="absolute top-full mt-1 right-0 z-50 w-56 rounded-lg border bg-popover shadow-lg overflow-hidden">
                  {filteredPersons.map(p => {
                    const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                    return (
                      <button
                        key={p.id}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors"
                        onClick={() => {
                          setHighlightPersonId(p.id);
                          setHighlightPersonName(name);
                          setPersonSearch("");
                          setSearchOpen(false);
                        }}
                      >
                        <span className="font-medium truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border relative z-0" style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
        <PlacesMap
          places={geocoded}
          heatmap={heatmap}
          showMigration={migration}
          storyMarkers={storyMarkers}
          filters={filters}
        />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-[500] bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-sm space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Legend</p>
          <div className="space-y-0.5">
            {showBirth && <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#3b82f6" }} />Birth</div>}
            {showDeath && <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#6b7280" }} />Death</div>}
            {showStories && storyMarkers.length > 0 && <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />Story</div>}
            {highlightPersonId && <div className="flex items-center gap-2 text-xs"><svg width="10" height="14" viewBox="0 0 28 41" className="shrink-0"><path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 27 14 27s14-16.5 14-27C28 6.268 21.732 0 14 0z" fill="#10b981"/></svg>Selected</div>}
            {migration && <div className="flex items-center gap-2 text-xs"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: "#6366f1" }} />Migration</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
