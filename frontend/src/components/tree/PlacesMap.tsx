import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { Place } from "@/types/place";

interface PlaceWithPersons extends Place {
  persons?: { id: string; name: string; field: string }[];
}

export interface StoryMarker {
  id: string;
  title: string;
  lat: number;
  lon: number;
  location: string;
  year?: string;
}

export interface MapFilters {
  showBirth: boolean;
  showDeath: boolean;
  showStories: boolean;
  highlightPersonId?: string | null;
}

interface Props {
  places: PlaceWithPersons[];
  selectedPlaceId?: string | null;
  onMarkerClick?: (placeId: string) => void;
  heatmap?: boolean;
  showMigration?: boolean;
  storyMarkers?: StoryMarker[];
  filters?: MapFilters;
  fitSignal?: number;
  treeSlug?: string;
}

function makeDotIcon(color: string, size = 12, highlight = false): L.DivIcon {
  const s = highlight ? size + 4 : size;
  const border = highlight ? "3px solid #fff" : "2px solid #fff";
  const shadow = highlight ? "0 0 8px 2px rgba(0,0,0,.3)" : "0 1px 3px rgba(0,0,0,.25)";
  return L.divIcon({
    className: "",
    html: `<div style="width:${s}px;height:${s}px;background:${color};border:${border};border-radius:50%;box-shadow:${shadow};"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -s / 2 - 2],
  });
}

const BIRTH_COLOR = "#3b82f6";
const DEATH_COLOR = "#6b7280";
const STORY_COLOR = "#f59e0b";
const HIGHLIGHT_COLOR = "#10b981";

const birthIcon = makeDotIcon(BIRTH_COLOR);
const deathIcon = makeDotIcon(DEATH_COLOR);
const storyDotIcon = makeDotIcon(STORY_COLOR);

const highlightIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:28px;height:41px;">
    <svg width="28" height="41" viewBox="0 0 28 41" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 27 14 27s14-16.5 14-27C28 6.268 21.732 0 14 0z" fill="${HIGHLIGHT_COLOR}"/>
      <circle cx="14" cy="14" r="7" fill="#fff"/>
      <circle cx="14" cy="14" r="4" fill="${HIGHLIGHT_COLOR}"/>
    </svg>
  </div>`,
  iconSize: [28, 41],
  iconAnchor: [14, 41],
  popupAnchor: [0, -36],
});

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -40],
  shadowSize: [49, 49],
  className: "leaflet-marker-selected",
});

function FitBounds({ places, storyMarkers = [] }: { places: PlaceWithPersons[]; storyMarkers?: StoryMarker[] }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    const pts: [number, number][] = [
      ...places.filter(p => p.lat !== null && p.lon !== null).map(p => [p.lat!, p.lon!] as [number, number]),
      ...storyMarkers.map(s => [s.lat, s.lon] as [number, number]),
    ];
    if (pts.length === 0) return;
    if (pts.length === prevCount.current) return;
    prevCount.current = pts.length;
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [places, storyMarkers, map]);

  return null;
}

function FitOnSignal({ places, storyMarkers, signal }: { places: PlaceWithPersons[]; storyMarkers: StoryMarker[]; signal?: number }) {
  const map = useMap();
  const prev = useRef<number | undefined>(signal);
  useEffect(() => {
    if (signal === undefined || signal === prev.current) return;
    prev.current = signal;
    const pts: [number, number][] = [
      ...places.filter(p => p.lat != null && p.lon != null).map(p => [p.lat!, p.lon!] as [number, number]),
      ...storyMarkers.map(s => [s.lat, s.lon] as [number, number]),
    ];
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 10 });
  }, [signal, map, places, storyMarkers]);
  return null;
}

function HeatmapLayer({ places }: { places: PlaceWithPersons[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const pts = places
      .filter(p => p.lat != null && p.lon != null)
      .map(p => {
        const count = p.persons?.length ?? 1;
        return [p.lat!, p.lon!, Math.log(count + 1)] as [number, number, number];
      });

    if (pts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heat = (L as any).heatLayer(pts, {
        radius: 30,
        blur: 20,
        maxZoom: 12,
        gradient: { 0.2: "blue", 0.4: "lime", 0.6: "yellow", 0.8: "orange", 1: "red" },
      });
      heat.addTo(map);
      layerRef.current = heat;
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [places, map]);

  return null;
}

function MigrationLayer({ places }: { places: PlaceWithPersons[] }) {
  const routes = useMemo(() => {
    const personPlaces = new Map<string, { birth?: PlaceWithPersons; death?: PlaceWithPersons }>();
    for (const p of places) {
      for (const pr of p.persons ?? []) {
        const entry = personPlaces.get(pr.id) ?? {};
        if (pr.field === "birth") entry.birth = p;
        if (pr.field === "death") entry.death = p;
        personPlaces.set(pr.id, entry);
      }
    }

    const routeMap = new Map<string, { from: PlaceWithPersons; to: PlaceWithPersons; persons: string[] }>();
    for (const [id, { birth, death }] of personPlaces) {
      if (!birth || !death || birth.id === death.id) continue;
      if (birth.lat == null || birth.lon == null || death.lat == null || death.lon == null) continue;
      const key = `${birth.id}:${death.id}`;
      const entry = routeMap.get(key);
      if (entry) { entry.persons.push(id); }
      else { routeMap.set(key, { from: birth, to: death, persons: [id] }); }
    }

    return [...routeMap.values()];
  }, [places]);

  return (
    <>
      {routes.map((r, i) => (
        <Polyline
          key={i}
          positions={[[r.from.lat!, r.from.lon!], [r.to.lat!, r.to.lon!]]}
          pathOptions={{ color: "#6366f1", weight: Math.min(1 + r.persons.length, 5), dashArray: "6 4", opacity: 0.6 }}
        >
          <Popup>
            <div className="text-xs space-y-0.5">
              <p className="font-medium">{r.from.display_name} → {r.to.display_name}</p>
              <p className="text-muted-foreground">{r.persons.length} person{r.persons.length !== 1 ? "s" : ""}</p>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}

function MapClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function PickerMap({ lat, lon, onPick }: { lat: number | null; lon: number | null; onPick: (lat: number, lon: number) => void }) {
  const center: [number, number] = lat != null && lon != null ? [lat, lon] : [46.8, 8.2];
  return (
    <MapContainer center={center} zoom={lat != null ? 12 : 5} className="h-[200px] w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onPick={onPick} />
      {lat != null && lon != null && (
        <Marker position={[lat, lon]} icon={defaultIcon} />
      )}
    </MapContainer>
  );
}

// ─── Main map ─────────────────────────────────────────────────────────────────

export function PlacesMap({ places, selectedPlaceId, onMarkerClick, heatmap = false, showMigration = false, storyMarkers = [], filters, fitSignal, treeSlug }: Props) {
  const geocoded = places.filter((p) => p.lat !== null && p.lon !== null);
  if (geocoded.length === 0 && storyMarkers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-muted rounded-lg border">
        No geocoded places to display.
      </div>
    );
  }

  const center: [number, number] = geocoded.length > 0
    ? [geocoded[0].lat!, geocoded[0].lon!]
    : [storyMarkers[0].lat, storyMarkers[0].lon];

  const showBirth = filters?.showBirth ?? true;
  const showDeath = filters?.showDeath ?? true;
  const showStoriesF = filters?.showStories ?? true;
  const hlId = filters?.highlightPersonId;

  return (
    <MapContainer
      center={center}
      zoom={5}
      className="h-full w-full rounded-lg"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds places={geocoded} storyMarkers={showStoriesF ? storyMarkers : []} />
      <FitOnSignal places={geocoded} storyMarkers={showStoriesF ? storyMarkers : []} signal={fitSignal} />
      {heatmap ? (
        <HeatmapLayer places={geocoded} />
      ) : (
        geocoded.map((p) => {
          const hasBirth = p.persons?.some(pr => pr.field === "birth");
          const hasDeath = p.persons?.some(pr => pr.field === "death");
          const isHighlighted = hlId && p.persons?.some(pr => pr.id === hlId);

          if (!isHighlighted) {
            if (!showBirth && !showDeath) return null;
            if (!showBirth && hasBirth && !hasDeath) return null;
            if (!showDeath && hasDeath && !hasBirth) return null;
          }

          const icon = isHighlighted
            ? highlightIcon
            : selectedPlaceId === p.id
              ? selectedIcon
              : hasBirth && hasDeath
                ? birthIcon
                : hasDeath
                  ? deathIcon
                  : birthIcon;

          return (
            <Marker
              key={p.id}
              position={[p.lat!, p.lon!]}
              icon={icon}
              eventHandlers={{ click: () => onMarkerClick?.(p.id) }}
            >
              <Popup>
                <div className="text-sm min-w-[160px]">
                  <p className="font-semibold">{p.display_name}</p>
                  {p.persons && p.persons.length > 0 && (
                    <div className="text-xs border-t pt-1 mt-1 overflow-y-auto max-h-[120px] space-y-0.5">
                      {[...p.persons].sort((a, b) => a.name.localeCompare(b.name)).map((pr) => (
                        <div key={`${pr.id}-${pr.field}`} className="flex items-center gap-1">
                          {treeSlug ? (
                            <Link
                              to={`/trees/${treeSlug}/people/${pr.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {pr.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{pr.name}</span>
                          )}
                          <span className="opacity-50">· {pr.field}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })
      )}
      {showMigration && <MigrationLayer places={geocoded} />}
      {showStoriesF && storyMarkers.map(s => (
        <Marker key={`story-${s.id}`} position={[s.lat, s.lon]} icon={storyDotIcon}>
          <Popup>
            <div className="text-sm min-w-[120px] space-y-0.5">
              {treeSlug ? (
                <Link
                  to={`/trees/${treeSlug}/stories/${s.id}`}
                  className="font-semibold text-primary hover:underline block"
                >
                  {s.title}
                </Link>
              ) : (
                <p className="font-semibold">{s.title}</p>
              )}
              {(s.year || s.location) && (
                <p className="text-xs text-muted-foreground">{[s.year, s.location].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
