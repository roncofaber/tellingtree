import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTreePlaceDetails, updatePlace, deletePlace, searchPlaces, batchGeocode, type BatchGeocodeEvent } from "@/api/places";
import { listPersons, updatePerson } from "@/api/persons";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { PlacesMap, PickerMap } from "@/components/tree/PlacesMap";
import type { Place } from "@/types/place";

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditPlaceDialog({ place, treeId, onClose }: { place: Place | null; treeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(place?.display_name ?? "");
  const [city,        setCity]        = useState(place?.city        ?? "");
  const [region,      setRegion]      = useState(place?.region      ?? "");
  const [country,     setCountry]     = useState(place?.country     ?? "");
  const [lat,         setLat]         = useState(String(place?.lat  ?? ""));
  const [lon,         setLon]         = useState(String(place?.lon  ?? ""));
  const [showPicker,  setShowPicker]  = useState(false);

  useEffect(() => {
    if (place) {
      setDisplayName(place.display_name ?? "");
      setCity(place.city ?? "");
      setRegion(place.region ?? "");
      setCountry(place.country ?? "");
      setLat(String(place.lat ?? ""));
      setLon(String(place.lon ?? ""));
      setShowPicker(false);
    }
  }, [place]);

  // Persons linked to this place (from cache — no extra request)
  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
    enabled:  !!place,
  });

  const linked = useMemo(() => {
    if (!place) return [];
    const rows: { personId: string; name: string; rawString: string | null; field: "birth" | "death" }[] = [];
    for (const p of personsData?.items ?? []) {
      const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
      if (p.birth_place_id === place.id) rows.push({ personId: p.id, name, rawString: p.birth_location ?? null, field: "birth" });
      if (p.death_place_id === place.id) rows.push({ personId: p.id, name, rawString: p.death_location ?? null, field: "death" });
    }
    return rows;
  }, [place, personsData]);

  const saveMut = useMutation({
    mutationFn: () => updatePlace(place!.id, { display_name: displayName, city: city||null, region: region||null, country: country||null, lat: lat ? parseFloat(lat) : null, lon: lon ? parseFloat(lon) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId) });
      onClose();
    },
  });

  const unlinkMut = useMutation({
    mutationFn: ({ personId, field }: { personId: string; field: "birth" | "death" }) =>
      updatePerson(treeId, personId, field === "birth" ? { birth_place_id: null } : { death_place_id: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.full(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId) });
    },
  });

  const handleMapPick = (pickedLat: number, pickedLon: number) => {
    setLat(pickedLat.toFixed(6));
    setLon(pickedLon.toFixed(6));
  };

  return (
    <Dialog open={!!place} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Place</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); saveMut.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} required /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-xs">City</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Region</Label><Input value={region} onChange={e => setRegion(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Country</Label><Input value={country} onChange={e => setCountry(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Coordinates</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowPicker(s => !s)}
              >
                {showPicker ? "Hide map" : "Pick on map"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="45.8674" />
              <Input value={lon} onChange={e => setLon(e.target.value)} placeholder="8.9821" />
            </div>
            {showPicker && (
              <div className="mt-2 rounded-lg overflow-hidden border">
                <p className="text-xs text-muted-foreground px-2 py-1 bg-slate-50 border-b">Click on the map to set coordinates</p>
                <PickerMap
                  lat={lat ? parseFloat(lat) : null}
                  lon={lon ? parseFloat(lon) : null}
                  onPick={handleMapPick}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saveMut.isPending} className="flex-1">{saveMut.isPending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>

        {/* Linked raw strings */}
        {linked.length > 0 && (
          <div className="border-t pt-3 mt-1 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linked raw strings</p>
            <div className="space-y-1">
              {linked.map((row, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium truncate">{row.name}</p>
                    <p className="text-muted-foreground break-all font-mono">
                      {row.rawString ?? <em>no raw string</em>}
                    </p>
                    <Badge variant="outline" className="text-xs capitalize">{row.field}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-7 text-xs text-muted-foreground hover:text-destructive"
                    disabled={unlinkMut.isPending}
                    onClick={() => unlinkMut.mutate({ personId: row.personId, field: row.field })}
                  >
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Geocode dialog ──────────────────────────────────────────────────────────

interface RawLocation { location: string; personIds: string[]; field: "birth" | "death" }

function preprocessLocationQuery(raw: string): string {
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return raw.trim();
  const filtered = parts.filter(p => !/^\d{3,6}$/.test(p));
  if (!filtered.length) return raw.trim();
  const deduped = [filtered[0]];
  for (const p of filtered.slice(1)) {
    if (p.toLowerCase() !== deduped[deduped.length - 1].toLowerCase()) deduped.push(p);
  }
  return deduped.slice(0, 2).join(", ");
}

function GeocodeDialog({
  raw, treeId, onClose,
}: { raw: RawLocation | null; treeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery]     = useState(raw?.location ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying]   = useState(false);
  const [error, setError]     = useState("");
  const didAutoSearch = useRef(false);

  useEffect(() => {
    if (raw && !didAutoSearch.current) {
      didAutoSearch.current = true;
      const q = preprocessLocationQuery(raw.location);
      setQuery(q);
      doSearchWith(q);
    }
    if (!raw) didAutoSearch.current = false;
  }, [raw]); // eslint-disable-line

  const doSearchWith = async (q: string) => {
    if (q.trim().length < 2) return;
    setSearching(true); setError(""); setResults([]);
    try {
      const res = await searchPlaces(q.trim());
      setResults(res);
      if (res.length === 0) setError("No results found. Try a different query.");
    } catch { setError("Search failed."); }
    finally { setSearching(false); }
  };

  const doSearch = () => doSearchWith(query);

  const applyResult = async (place: Place) => {
    if (!raw) return;
    setApplying(true); setError("");
    try {
      await Promise.all(raw.personIds.map(id =>
        updatePerson(treeId, id, raw.field === "birth" ? { birth_place_id: place.id } : { death_place_id: place.id })
      ));
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.full(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId) });
      onClose();
    } catch { setError("Failed to link place."); }
    finally { setApplying(false); }
  };

  return (
    <Dialog open={!!raw} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Geocode Location</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
            <span className="text-muted-foreground">Raw:</span> <span className="font-medium">{raw?.location}</span>
            <span className="text-xs text-muted-foreground ml-2">({raw?.personIds.length} {raw?.personIds.length === 1 ? "person" : "people"})</span>
          </div>

          <div className="flex gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for a place…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
            />
            <Button onClick={doSearch} disabled={searching || query.trim().length < 2}>
              {searching ? "…" : "Search"}
            </Button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {results.length > 0 && (
            <div className="border rounded-lg divide-y">
              {results.map(place => (
                <div key={place.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{place.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[place.city, place.region, place.country].filter(Boolean).join(", ")}
                      {place.lat !== null && place.lon !== null && (
                        <span className="ml-2 font-mono">{place.lat.toFixed(4)}, {place.lon.toFixed(4)}</span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline" className="shrink-0 ml-2"
                    disabled={applying}
                    onClick={() => applyResult(place)}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Raw location geocoder ────────────────────────────────────────────────────

function RawLocationsTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const [geocoding, setGeocoding] = useState<RawLocation | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchGeocodeEvent | null>(null);

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const rawLocations = useMemo((): RawLocation[] => {
    const map = new Map<string, { personIds: string[]; field: "birth" | "death" }>();
    for (const p of personsData?.items ?? []) {
      if (p.birth_location && !p.birth_place_id) {
        const existing = map.get(p.birth_location);
        if (existing) existing.personIds.push(p.id);
        else map.set(p.birth_location, { personIds: [p.id], field: "birth" });
      }
      if (p.death_location && !p.death_place_id) {
        const key = `death:${p.death_location}`;
        const existing = map.get(key);
        if (existing) existing.personIds.push(p.id);
        else map.set(key, { personIds: [p.id], field: "death" });
      }
    }
    return [...map.entries()].map(([loc, data]) => ({
      location: loc.startsWith("death:") ? loc.slice(6) : loc,
      ...data,
    }));
  }, [personsData]);

  const handleBatchGeocode = async () => {
    setBatchRunning(true); setBatchProgress(null);
    try {
      await batchGeocode(treeId, (event) => setBatchProgress(event));
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.full(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId) });
    } finally { setBatchRunning(false); }
  };

  if (!rawLocations.length && !batchRunning) return <p className="text-sm text-muted-foreground py-6 text-center">All locations are geocoded.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rawLocations.length} unique unlinked location(s).</p>
        <Button size="sm" variant="outline" disabled={batchRunning || rawLocations.length === 0} onClick={handleBatchGeocode}>
          {batchRunning ? "Geocoding…" : "Geocode All"}
        </Button>
      </div>
      {batchRunning && batchProgress && (
        <div className="space-y-1.5 rounded-lg border p-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {batchProgress.phase === "done"
                ? `Done — ${batchProgress.linked} linked, ${batchProgress.failed} failed`
                : `${batchProgress.current} / ${batchProgress.total} — ${batchProgress.location}`}
            </span>
            {batchProgress.status === "linked" && <span className="text-green-600">Linked</span>}
            {batchProgress.status === "no_match" && <span className="text-amber-600">No match</span>}
            {batchProgress.status === "error" && <span className="text-destructive">Error</span>}
          </div>
          {batchProgress.total && batchProgress.current !== undefined && (
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      <Table>
        <TableHeader><TableRow><TableHead>Raw Location</TableHead><TableHead>Field</TableHead><TableHead>People</TableHead><TableHead className="w-28">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {rawLocations.map(raw => (
            <TableRow key={`${raw.field}:${raw.location}`}>
              <TableCell className="text-sm font-medium">{raw.location}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs capitalize">{raw.field}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{raw.personIds.length}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => setGeocoding(raw)}>Geocode</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <GeocodeDialog raw={geocoding} treeId={treeId} onClose={() => setGeocoding(null)} />
    </div>
  );
}

// ─── GeoJSON export ───────────────────────────────────────────────────────────

interface PlaceDetail extends Place {
  persons: { id: string; name: string; field: string }[];
}

function exportGeoJSON(places: PlaceDetail[]) {
  const features = places
    .filter(p => p.lat != null && p.lon != null)
    .map(p => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        name: p.display_name,
        city: p.city ?? null,
        region: p.region ?? null,
        country: p.country ?? null,
        persons: p.persons.map(pr => `${pr.name} (${pr.field})`).join("; "),
        person_count: p.persons.length,
        geocoder: p.geocoder ?? null,
      },
    }));
  const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "places.geojson";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PlacesTab ────────────────────────────────────────────────────────────────

export function PlacesTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const [search,          setSearch]          = useState("");
  const [editing,         setEditing]         = useState<Place | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [showHeatmap,     setShowHeatmap]     = useState(false);
  const [showMigration,   setShowMigration]   = useState(false);
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set());
  const [expandedPersons,   setExpandedPersons]    = useState<Set<string>>(new Set());

  const { data: places, isLoading } = useQuery({
    queryKey: queryKeys.places.forTreeDetails(treeId),
    queryFn:  () => listTreePlaceDetails(treeId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePlace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTreeDetails(treeId) });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (places ?? []).filter(p =>
      !q || p.display_name.toLowerCase().includes(q) || (p.country ?? "").toLowerCase().includes(q)
    );
  }, [places, search]);

  // Group filtered places by country, alphabetical, Unknown last
  const byCountry = useMemo(() => {
    const map = new Map<string, PlaceDetail[]>();
    for (const p of filtered) {
      const key = p.country ?? "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const toggleCountry = useCallback((country: string) => {
    setCollapsedCountries(prev => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country); else next.add(country);
      return next;
    });
  }, []);

  const allCollapsed = byCountry.length > 0 && byCountry.every(([c]) => collapsedCountries.has(c));
  const toggleAll = () => {
    if (allCollapsed) setCollapsedCountries(new Set());
    else setCollapsedCountries(new Set(byCountry.map(([c]) => c)));
  };

  if (isLoading) return <LoadingSpinner />;

  const geocoded   = (places ?? []).filter(p => p.lat !== null).length;
  const ungeocoded = (places ?? []).length - geocoded;

  return (
    <div className="space-y-3">
      <Tabs defaultValue="geocoded">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <TabsList>
            <TabsTrigger value="geocoded">Places ({places?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="raw">Raw Locations</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {ungeocoded > 0 && <Badge variant="outline" className="text-xs">{ungeocoded} missing coords</Badge>}
            {geocoded > 0   && <Badge variant="secondary" className="text-xs">{geocoded} geocoded</Badge>}
          </div>
        </div>

        <TabsContent value="geocoded">
          <div className="space-y-3">
            {/* Map */}
            {geocoded > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button
                      className={`text-xs px-2 py-1 rounded border transition-colors ${showHeatmap ? "bg-primary text-primary-foreground border-primary" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                      onClick={() => setShowHeatmap(h => !h)}
                    >
                      Heatmap
                    </button>
                    <button
                      className={`text-xs px-2 py-1 rounded border transition-colors ${showMigration ? "bg-primary text-primary-foreground border-primary" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                      onClick={() => setShowMigration(m => !m)}
                    >
                      Migration lines
                    </button>
                  </div>
                </div>
                <div className="h-[500px] rounded-lg border overflow-hidden isolate">
                  <PlacesMap
                    places={filtered}
                    selectedPlaceId={selectedPlaceId}
                    onMarkerClick={setSelectedPlaceId}
                    heatmap={showHeatmap}
                    showMigration={showMigration}
                  />
                </div>
              </div>
            )}

            {/* Table toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Input placeholder="Filter places…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-56" />
                {byCountry.length > 1 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={toggleAll}
                  >
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                )}
              </div>
              {filtered.length > 0 && (
                <button
                  className="text-xs px-2 py-1 rounded border bg-white border-slate-200 hover:bg-slate-50 transition-colors"
                  onClick={() => exportGeoJSON(filtered as PlaceDetail[])}
                  title="Download visible places as GeoJSON"
                >
                  Export GeoJSON
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {search ? "No places match." : "No places yet. Link a location to a person to get started."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Place</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>People</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                {byCountry.map(([country, countryPlaces]) => {
                  const collapsed = collapsedCountries.has(country);
                  return (
                    <tbody key={country}>
                      {/* Country header row */}
                      <tr
                        className="cursor-pointer border-t-2 border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                        onClick={() => toggleCountry(country)}
                      >
                        <td colSpan={5} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            {collapsed
                              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            }
                            <span className="text-sm font-semibold">{country}</span>
                            <Badge variant="secondary" className="text-xs font-normal">{countryPlaces.length}</Badge>
                          </div>
                        </td>
                      </tr>

                      {/* Place rows */}
                      {!collapsed && countryPlaces.map(p => (
                        <TableRow
                          key={p.id}
                          className={`cursor-pointer ${p.id === selectedPlaceId ? "bg-primary/5" : ""}`}
                          onClick={() => setSelectedPlaceId(prev => prev === p.id ? null : p.id)}
                        >
                          <TableCell>
                            <p className="font-medium text-sm">{p.display_name}</p>
                            {p.city && p.city !== p.display_name && (
                              <p className="text-xs text-muted-foreground">{[p.city, p.region].filter(Boolean).join(", ")}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {p.lat !== null && p.lon !== null
                              ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`
                              : <span className="text-amber-500">Missing</span>}
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            {p.persons.length > 0 ? (() => {
                              const expanded = expandedPersons.has(p.id);
                              const visible  = expanded ? p.persons : p.persons.slice(0, 3);
                              const hidden   = p.persons.length - 3;
                              return (
                                <div className="space-y-0.5">
                                  {visible.map(pr => (
                                    <Link
                                      key={pr.id}
                                      to={`/trees/${treeId}/persons/${pr.id}`}
                                      className="block text-xs text-primary hover:underline"
                                    >
                                      {pr.name} <span className="text-muted-foreground">({pr.field})</span>
                                    </Link>
                                  ))}
                                  {hidden > 0 && !expanded && (
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                      onClick={() => setExpandedPersons(prev => new Set([...prev, p.id]))}
                                    >
                                      +{hidden} more
                                    </button>
                                  )}
                                  {expanded && (
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                      onClick={() => setExpandedPersons(prev => { const s = new Set(prev); s.delete(p.id); return s; })}
                                    >
                                      Show less
                                    </button>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.geocoder === "manual" ? "secondary" : "outline"} className="text-xs">
                              {p.geocoder === "manual" ? "Manual" : "Auto"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate(p.id)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  );
                })}
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <RawLocationsTab treeId={treeId} />
        </TabsContent>
      </Tabs>

      <EditPlaceDialog place={editing} treeId={treeId} onClose={() => setEditing(null)} />
    </div>
  );
}
