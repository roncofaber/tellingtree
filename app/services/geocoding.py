"""Nominatim geocoding service (stdlib only, no extra dependencies)."""

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass


@dataclass
class GeoResult:
    display_name: str
    city: str | None
    region: str | None
    country: str | None
    country_code: str | None
    lat: float | None
    lon: float | None


def _parse_address(r: dict) -> GeoResult:
    addr = r.get("address", {})
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
    )
    region = addr.get("state") or addr.get("county")
    country = addr.get("country")
    country_code = addr.get("country_code", "").upper() or None
    try:
        lat = float(r["lat"])
        lon = float(r["lon"])
    except (KeyError, ValueError, TypeError):
        lat = lon = None

    # Build a clean display name from structured components rather than Nominatim's
    # verbose full string (e.g. "Lugano, Ticino, Switzerland" instead of the long form)
    parts = [p for p in [city, region, country] if p]
    display_name = ", ".join(parts) if parts else r.get("display_name", "")

    return GeoResult(
        display_name=display_name,
        city=city,
        region=region,
        country=country,
        country_code=country_code,
        lat=lat,
        lon=lon,
    )


def geocode(query: str, limit: int = 6) -> list[GeoResult]:
    """Call Nominatim and return geocoded results. Returns [] on any error."""
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
