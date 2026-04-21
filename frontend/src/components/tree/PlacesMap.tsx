import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { Place } from "@/types/place";

interface PlaceWithPersons extends Place {
  persons?: { id: string; name: string; field: string }[];
}

interface Props {
  places: PlaceWithPersons[];
  selectedPlaceId?: string | null;
  onMarkerClick?: (placeId: string) => void;
  heatmap?: boolean;
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

function FitBounds({ places }: { places: PlaceWithPersons[] }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    const pts = places.filter((p) => p.lat !== null && p.lon !== null);
    if (pts.length === 0) return;
    if (pts.length === prevCount.current) return;
    prevCount.current = pts.length;
    const bounds = L.latLngBounds(pts.map((p) => [p.lat!, p.lon!]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [places, map]);

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
      const intensity = p.persons ? p.persons.length : 1;
      points.push([p.lat, p.lon, intensity]);
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

export function PlacesMap({ places, selectedPlaceId, onMarkerClick, heatmap = false }: Props) {
  const geocoded = places.filter((p) => p.lat !== null && p.lon !== null);
  if (geocoded.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-slate-50 rounded-lg border">
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
      <FitBounds places={geocoded} />
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
                    {p.persons.map((pr) => (
                      <p key={`${pr.id}-${pr.field}`}>
                        {pr.name} <span className="text-slate-400">({pr.field})</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))
      )}
    </MapContainer>
  );
}
