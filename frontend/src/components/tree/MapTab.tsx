import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTreePlaceDetails, listTreePlaces, searchPlaces } from "@/api/places";
import { listStories } from "@/api/stories";
import { queryKeys } from "@/lib/queryKeys";
import { PlacesMap, type StoryMarker } from "@/components/tree/PlacesMap";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { MapPin } from "lucide-react";
import type { Place } from "@/types/place";

export function MapTab({ treeId }: { treeId: string }) {
  const [heatmap, setHeatmap] = useState(false);
  const [migration, setMigration] = useState(false);
  const [showStories, setShowStories] = useState(true);
  const [storyPlaceCache, setStoryPlaceCache] = useState<Map<string, { lat: number; lon: number } | null>>(new Map());

  const { data: placeDetails, isLoading: loadingPlaces } = useQuery({
    queryKey: queryKeys.places.forTreeDetails(treeId),
    queryFn: () => listTreePlaceDetails(treeId),
  });

  const { data: allPlaces } = useQuery({
    queryKey: queryKeys.places.forTree(treeId),
    queryFn: () => listTreePlaces(treeId),
  });

  const { data: storiesData, isLoading: loadingStories } = useQuery({
    queryKey: queryKeys.stories.all(treeId),
    queryFn: () => listStories(treeId, { limit: 10000 }),
  });

  const geocoded = (placeDetails ?? []).filter(p => p.lat !== null && p.lon !== null);

  // Collect unique story locations that need resolving
  const unresolvedLocations = useMemo(() => {
    const locs: string[] = [];
    for (const s of storiesData?.items ?? []) {
      if (s.event_location && !storyPlaceCache.has(s.event_location)) {
        locs.push(s.event_location);
      }
    }
    return [...new Set(locs)];
  }, [storiesData, storyPlaceCache]);

  // Resolve story locations: first check allPlaces by exact name match, then search API
  useEffect(() => {
    if (!showStories || unresolvedLocations.length === 0) return;

    let cancelled = false;
    const placesByName = new Map<string, Place>();
    for (const p of allPlaces ?? []) {
      if (p.lat !== null && p.lon !== null) {
        placesByName.set(p.display_name.toLowerCase(), p);
      }
    }

    (async () => {
      const updates = new Map<string, { lat: number; lon: number } | null>();

      for (const loc of unresolvedLocations) {
        if (cancelled) break;

        // Try exact match from tree places first
        const exact = placesByName.get(loc.toLowerCase());
        if (exact) {
          updates.set(loc, { lat: exact.lat!, lon: exact.lon! });
          continue;
        }

        // Fall back to search API (hits global cache + Nominatim)
        try {
          const results = await searchPlaces(loc);
          const match = results.find(p => p.lat !== null && p.lon !== null);
          if (match) {
            updates.set(loc, { lat: match.lat!, lon: match.lon! });
          } else {
            updates.set(loc, null);
          }
        } catch {
          updates.set(loc, null);
        }
      }

      if (!cancelled && updates.size > 0) {
        setStoryPlaceCache(prev => {
          const next = new Map(prev);
          for (const [k, v] of updates) next.set(k, v);
          return next;
        });
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
        markers.push({
          id: s.id,
          title: s.title,
          lat: coords.lat,
          lon: coords.lon,
          location: s.event_location,
          year: s.event_date?.slice(0, 4),
        });
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

  const toggleBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center">
          {toggleBtn(heatmap, () => setHeatmap(h => !h), "Heatmap")}
          {toggleBtn(migration, () => setMigration(m => !m), "Migration")}
          {toggleBtn(showStories, () => setShowStories(s => !s), `Stories (${storyMarkers.length})`)}
        </div>
        <span className="text-xs text-muted-foreground">{geocoded.length} place{geocoded.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="rounded-lg overflow-hidden border relative z-0" style={{ height: "calc(100vh - 240px)", minHeight: 400 }}>
        <PlacesMap places={geocoded} heatmap={heatmap} showMigration={migration} storyMarkers={storyMarkers} />
      </div>
    </div>
  );
}
