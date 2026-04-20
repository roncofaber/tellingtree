import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { searchPlaces } from "@/api/places";
import type { Place } from "@/types/place";

interface Props {
  value: string;
  placeId?: string | null;
  onChange: (value: string, placeId: string | null) => void;
  placeholder?: string;
  className?: string;
}

export function LocationInput({ value, placeId: _placeId, onChange, placeholder = "City, region, country…", className }: Props) {
  const [query,   setQuery]   = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef          = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const places = await searchPlaces(q);
      setResults(places);
      setOpen(places.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val, null); // clear place_id when typing manually
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = (place: Place) => {
    setQuery(place.display_name);
    onChange(place.display_name, place.id);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto text-sm">
          {results.map((place) => (
            <li
              key={place.id}
              className="px-3 py-2 cursor-pointer hover:bg-muted"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(place); }}
            >
              <span className="font-medium">{place.city ?? place.display_name.split(",")[0]}</span>
              {(place.region || place.country) && (
                <span className="text-muted-foreground ml-1 text-xs">
                  {[place.region, place.country].filter(Boolean).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
