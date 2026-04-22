import { useEffect, useMemo, useRef } from "react";
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

interface Props {
  places: PlaceWithPersons[];
  selectedPlaceId?: string | null;
  onMarkerClick?: (placeId: string) => void;
  heatmap?: boolean;
  showMigration?: boolean;
  storyMarkers?: StoryMarker[];
}

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

function HeatmapLayer({ places }: { places: PlaceWithPersons[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const points: [number, number, number][] = [];
    for (const p of places) {
      if (p.lat == null || p.lon == null) continue;
      const count = p.persons ? p.persons.length : 1;
      points.push([p.lat, p.lon, Math.log(count + 1)]);
    }
    if (points.length > 0) {
      const heat = (L as unknown as { heatLayer: (pts: [number, number, number][], opts: object) => L.Layer }).heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        max: Math.max(...points.map(p => p[2])),
        gradient: { 0.2: "#ffffb2", 0.4: "#fed976", 0.6: "#feb24c", 0.8: "#f03b20", 1: "#bd0026" },
      });
      heat.addTo(map);
      layerRef.current = heat;
    }
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [places, map]);

  return null;
}

// Draws dashed polylines between birth and death places for each person.
// Deduplicates by place-pair so shared routes are drawn once with increased weight.
function MigrationLayer({ places }: { places: PlaceWithPersons[] }) {
  const lines = useMemo(() => {
    const placeById = new Map<string, PlaceWithPersons>();
    for (const p of places) placeById.set(p.id, p);

    const birthByPerson = new Map<string, string>();
    const deathByPerson = new Map<string, string>();
    for (const place of places) {
      for (const pr of place.persons ?? []) {
        if (pr.field === "birth") birthByPerson.set(pr.id, place.id);
        else if (pr.field === "death") deathByPerson.set(pr.id, place.id);
      }
    }

    // Aggregate by place-pair key to merge duplicate routes
    const byPair = new Map<string, { from: [number, number]; to: [number, number]; count: number; names: string[] }>();
    for (const [personId, birthPlaceId] of birthByPerson) {
      const deathPlaceId = deathByPerson.get(personId);
      if (!deathPlaceId || deathPlaceId === birthPlaceId) continue;
      const bp = placeById.get(birthPlaceId);
      const dp = placeById.get(deathPlaceId);
      if (!bp?.lat || !bp.lon || !dp?.lat || !dp.lon) continue;

      const pairKey = `${birthPlaceId}-${deathPlaceId}`;
      const person = bp.persons?.find(p => p.id === personId);
      const name = person?.name ?? "";
      if (byPair.has(pairKey)) {
        const entry = byPair.get(pairKey)!;
        entry.count++;
        if (name) entry.names.push(name);
      } else {
        byPair.set(pairKey, {
          from: [bp.lat, bp.lon],
          to: [dp.lat, dp.lon],
          count: 1,
          names: name ? [name] : [],
        });
      }
    }
    return [...byPair.entries()].map(([key, v]) => ({ key, ...v }));
  }, [places]);

  return (
    <>
      {lines.map(line => (
        <Polyline
          key={line.key}
          positions={[line.from, line.to]}
          color="#3b82f6"
          weight={Math.min(1 + line.count, 5)}
          opacity={0.65}
          dashArray="5 6"
        >
          <Popup>
            <div className="text-xs space-y-0.5 min-w-[120px]">
              <p className="font-semibold text-slate-700">Migration</p>
              {line.names.slice(0, 5).map((n, i) => <p key={i}>{n}</p>)}
              {line.names.length > 5 && <p className="text-slate-400">+{line.names.length - 5} more</p>}
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}

// ─── Coordinate picker ────────────────────────────────────────────────────────

function MapClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function PickerMap({
  lat, lon, onPick,
}: {
  lat: number | null;
  lon: number | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const center: [number, number] = lat != null && lon != null ? [lat, lon] : [20, 0];
  return (
    <MapContainer
      center={center}
      zoom={lat != null ? 10 : 2}
      className="h-48 w-full rounded-lg cursor-crosshair"
      scrollWheelZoom
    >
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

const storyIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;background:#f59e0b;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10],
});

export function PlacesMap({ places, selectedPlaceId, onMarkerClick, heatmap = false, showMigration = false, storyMarkers = [] }: Props) {
  const geocoded = places.filter((p) => p.lat !== null && p.lon !== null);
  if (geocoded.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-muted rounded-lg border">
        No geocoded places to display.
      </div>
    );
  }

  return (
    <MapContainer
      center={[geocoded[0].lat!, geocoded[0].lon!]}
      zoom={5}
      className="h-full w-full rounded-lg"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds places={geocoded} storyMarkers={storyMarkers} />
      {heatmap ? (
        <HeatmapLayer places={geocoded} />
      ) : (
        geocoded.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat!, p.lon!]}
            icon={p.id === selectedPlaceId ? selectedIcon : defaultIcon}
            eventHandlers={{ click: () => onMarkerClick?.(p.id) }}
          >
            <Popup>
              <div className="text-sm space-y-1 min-w-[140px]">
                <p className="font-semibold">{p.display_name}</p>
                {p.persons && p.persons.length > 0 && (
                  <div className="text-xs text-slate-600 border-t pt-1 mt-1 space-y-0.5">
                    {p.persons.slice(0, 6).map((pr) => (
                      <p key={`${pr.id}-${pr.field}`}>
                        {pr.name} <span className="text-slate-400">({pr.field})</span>
                      </p>
                    ))}
                    {p.persons.length > 6 && (
                      <p className="text-slate-400">+{p.persons.length - 6} more</p>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))
      )}
      {showMigration && <MigrationLayer places={geocoded} />}
      {storyMarkers.map(s => (
        <Marker key={`story-${s.id}`} position={[s.lat, s.lon]} icon={storyIcon}>
          <Popup>
            <div className="text-sm min-w-[120px]">
              <p className="font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground">{[s.year, s.location].filter(Boolean).join(" · ")}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
