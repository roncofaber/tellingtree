from __future__ import annotations

import uuid

from client._base import BaseClient
from app.schemas.place import PlaceResponse


class PlacesClient(BaseClient):

    def search(self, q: str) -> list[PlaceResponse]:
        """Search existing places; geocodes via Nominatim on cache miss."""
        resp = self._get("/places/search", params={"q": q})
        return [PlaceResponse.model_validate(p) for p in resp.json()]

    def create(
        self,
        display_name: str,
        *,
        city: str | None = None,
        region: str | None = None,
        country: str | None = None,
        country_code: str | None = None,
        lat: float | None = None,
        lon: float | None = None,
    ) -> PlaceResponse:
        payload: dict = {"display_name": display_name}
        for k, v in dict(city=city, region=region, country=country,
                         country_code=country_code, lat=lat, lon=lon).items():
            if v is not None:
                payload[k] = v
        resp = self._post("/places", json=payload)
        return PlaceResponse.model_validate(resp.json())

    def get(self, place_id: uuid.UUID | str) -> PlaceResponse:
        resp = self._get(f"/places/{self._sid(place_id)}")
        return PlaceResponse.model_validate(resp.json())

    def update(
        self,
        place_id: uuid.UUID | str,
        *,
        display_name: str | None = None,
        city: str | None = None,
        region: str | None = None,
        country: str | None = None,
        country_code: str | None = None,
        lat: float | None = None,
        lon: float | None = None,
    ) -> PlaceResponse:
        payload: dict = {}
        for k, v in dict(display_name=display_name, city=city, region=region,
                         country=country, country_code=country_code,
                         lat=lat, lon=lon).items():
            if v is not None:
                payload[k] = v
        resp = self._put(f"/places/{self._sid(place_id)}", json=payload)
        return PlaceResponse.model_validate(resp.json())

    def delete(self, place_id: uuid.UUID | str) -> None:
        self._delete(f"/places/{self._sid(place_id)}")

    def list_for_tree(self, tree_id: uuid.UUID | str) -> list[PlaceResponse]:
        """Return all places referenced by persons in this tree."""
        resp = self._get(f"/trees/{self._sid(tree_id)}/places")
        return [PlaceResponse.model_validate(p) for p in resp.json()]
