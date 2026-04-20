import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTreePlaces, updatePlace, deletePlace, searchPlaces } from "@/api/places";
import { listPersons, updatePerson } from "@/api/persons";
import { queryKeys } from "@/lib/queryKeys";
import type { Place } from "@/types/place";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditPlaceDialog({ place, treeId, onClose }: { place: Place | null; treeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(place?.display_name ?? "");
  const [city,        setCity]        = useState(place?.city        ?? "");
  const [region,      setRegion]      = useState(place?.region      ?? "");
  const [country,     setCountry]     = useState(place?.country     ?? "");
  const [lat,         setLat]         = useState(String(place?.lat  ?? ""));
  const [lon,         setLon]         = useState(String(place?.lon  ?? ""));

  const mut = useMutation({
    mutationFn: () => updatePlace(place!.id, { display_name: displayName, city: city||null, region: region||null, country: country||null, lat: lat ? parseFloat(lat) : null, lon: lon ? parseFloat(lon) : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) }); onClose(); },
  });

  return (
    <Dialog open={!!place} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Place</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} required /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-xs">City</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Region</Label><Input value={region} onChange={e => setRegion(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Country</Label><Input value={country} onChange={e => setCountry(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Latitude</Label><Input value={lat} onChange={e => setLat(e.target.value)} placeholder="45.8674" /></div>
            <div className="space-y-1"><Label className="text-xs">Longitude</Label><Input value={lon} onChange={e => setLon(e.target.value)} placeholder="8.9821" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={mut.isPending} className="flex-1">{mut.isPending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Raw location geocoder ────────────────────────────────────────────────────

interface RawLocation { location: string; personIds: string[]; field: "birth" | "death" }

function RawLocationsTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const [geocoding, setGeocoding] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const geocodeLocation = async (raw: RawLocation) => {
    setGeocoding(raw.location); setErrors(e => ({ ...e, [raw.location]: "" }));
    try {
      const results = await searchPlaces(raw.location);
      if (!results.length) { setErrors(e => ({ ...e, [raw.location]: "No match found" })); return; }
      const place = results[0];
      await Promise.all(raw.personIds.map(id =>
        updatePerson(treeId, id, raw.field === "birth" ? { birth_place_id: place.id } : { death_place_id: place.id })
      ));
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.full(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) });
    } catch { setErrors(e => ({ ...e, [raw.location]: "Failed" })); }
    finally { setGeocoding(null); }
  };

  if (!rawLocations.length) return <p className="text-sm text-muted-foreground py-6 text-center">All locations are geocoded.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rawLocations.length} unique unlinked location(s). Click Geocode to search and link automatically.</p>
      <Table>
        <TableHeader><TableRow><TableHead>Raw Location</TableHead><TableHead>Field</TableHead><TableHead>People</TableHead><TableHead className="w-28">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {rawLocations.map(raw => (
            <TableRow key={`${raw.field}:${raw.location}`}>
              <TableCell className="text-sm font-medium">{raw.location}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs capitalize">{raw.field}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{raw.personIds.length}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={geocoding === raw.location} onClick={() => geocodeLocation(raw)}>
                    {geocoding === raw.location ? "…" : "Geocode"}
                  </Button>
                  {errors[raw.location] && <span className="text-xs text-destructive">{errors[raw.location]}</span>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── PlacesTab ────────────────────────────────────────────────────────────────

export function PlacesTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<Place | null>(null);

  const { data: places, isLoading } = useQuery({
    queryKey: queryKeys.places.forTree(treeId),
    queryFn:  () => listTreePlaces(treeId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePlace(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.places.forTree(treeId) }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (places ?? []).filter(p =>
      !q || p.display_name.toLowerCase().includes(q) || (p.country ?? "").toLowerCase().includes(q)
    );
  }, [places, search]);

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
            <Input placeholder="Filter places…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-56" />
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{search ? "No places match." : "No places yet. Link a location to a person to get started."}</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Place</TableHead><TableHead>Country</TableHead><TableHead>Coordinates</TableHead><TableHead>Source</TableHead><TableHead className="w-28">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{p.display_name}</p>
                        {p.city && p.city !== p.display_name && <p className="text-xs text-muted-foreground">{[p.city, p.region].filter(Boolean).join(", ")}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{p.country ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {p.lat !== null && p.lon !== null ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : <span className="text-amber-500">Missing</span>}
                      </TableCell>
                      <TableCell><Badge variant={p.geocoder === "manual" ? "secondary" : "outline"} className="text-xs">{p.geocoder ?? "—"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate(p.id)}>Del</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
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
