"""Nominatim geocoding service (stdlib only, no extra dependencies)."""

import json
import re
import time
import threading
import urllib.parse
import urllib.request
from dataclasses import dataclass

_last_request_lock = threading.Lock()
_last_request_time = 0.0


@dataclass
class GeoResult:
    display_name: str
    city: str | None
    region: str | None
    country: str | None
    country_code: str | None
    lat: float | None
    lon: float | None
    osm_id: int | None
    osm_type: str | None   # "node" | "way" | "relation"
    place_type: str | None  # "hamlet" | "city" | "village" | …


def _parse_address(r: dict) -> GeoResult:
    addr = r.get("address", {})

    village = addr.get("village")
    town    = addr.get("town")
    city_name = addr.get("city")

    # Most-specific sub-locality: explicit sub-types first, then a village that
    # sits inside a larger town/city (e.g. Tremona inside Mendrisio).
    # "locality" covers Swiss/Italian frazioni not tagged as hamlet in OSM.
    sub = (
        addr.get("hamlet")
        or addr.get("locality")
        or addr.get("isolated_dwelling")
        or addr.get("suburb")
        or addr.get("neighbourhood")
        or addr.get("quarter")
        or addr.get("city_district")
        or addr.get("district")
        or (village if (town or city_name) else None)
    )
    city = city_name or town or village or addr.get("municipality")
    region = addr.get("state") or addr.get("county")
    country = addr.get("country")
    country_code = addr.get("country_code", "").upper() or None
    try:
        lat = float(r["lat"])
        lon = float(r["lon"])
    except (KeyError, ValueError, TypeError):
        lat = lon = None

    # Build clean display name; include sub-locality if distinct from city
    # e.g. "Ronco, Lugano, Ticino, Switzerland" for a hamlet within Lugano
    parts = []
    if sub and sub != city:
        parts.append(sub)
    if city:
        parts.append(city)
    if region:
        parts.append(region)
    if country:
        parts.append(country)
    display_name = ", ".join(parts) if parts else r.get("display_name", "")

    try:
        osm_id = int(r["osm_id"]) if r.get("osm_id") is not None else None
    except (ValueError, TypeError):
        osm_id = None

    return GeoResult(
        display_name=display_name,
        city=city or sub,
        region=region,
        country=country,
        country_code=country_code,
        lat=lat,
        lon=lon,
        osm_id=osm_id,
        osm_type=r.get("osm_type") or None,
        place_type=r.get("type") or None,
    )


def preprocess_query(raw: str) -> str:
    """Simplify noisy GEDCOM location strings into a clean Nominatim query.

    "Tremona,6865,Tessin,Tessin,SUISSE,Parrocchia S. Agata" → "Tremona, Tessin"
    "Lugano" → "Lugano"
    "Paris, France" → "Paris, France"
    """
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) <= 1:
        return raw.strip()

    # Drop postal codes (3–6 consecutive digits)
    parts = [p for p in parts if not re.match(r"^\d{3,6}$", p)]
    if not parts:
        return raw.strip()

    # Deduplicate consecutive identical tokens (e.g. "Tessin, Tessin")
    deduped: list[str] = [parts[0]]
    for p in parts[1:]:
        if p.lower() != deduped[-1].lower():
            deduped.append(p)

    # Keep specific place name + one geographic context token
    return ", ".join(deduped[:2])


def _rate_limit():
    """Ensure at least 1 second between Nominatim requests."""
    global _last_request_time
    with _last_request_lock:
        now = time.monotonic()
        wait = 1.0 - (now - _last_request_time)
        if wait > 0:
            time.sleep(wait)
        _last_request_time = time.monotonic()


def geocode(query: str, limit: int = 6) -> list[GeoResult]:
    """Call Nominatim and return geocoded results. Returns [] on any error."""
    _rate_limit()
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": limit,
        "addressdetails": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "TellingTree/1.0 (genealogy app; contact via GitHub)",
            "Accept-Language": "en",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data: list[dict] = json.loads(resp.read())
    except Exception:
        return []

    return [_parse_address(r) for r in data]
