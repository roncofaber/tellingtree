from __future__ import annotations

import httpx

from client.auth import AuthClient
from client.users import UsersClient
from client.trees import TreesClient
from client.persons import PersonsClient
from client.relationships import RelationshipsClient
from client.stories import StoriesClient
from client.media import MediaClient
from client.tags import TagsClient
from client.places import PlacesClient
from client.imports import ImportsClient


class TellingTreeClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(timeout=60.0)
        self._access_token: str | None = None
        self._refresh_token: str | None = None

        self.auth = AuthClient(self)
        self.users = UsersClient(self)
        self.trees = TreesClient(self)
        self.persons = PersonsClient(self)
        self.relationships = RelationshipsClient(self)
        self.stories = StoriesClient(self)
        self.media = MediaClient(self)
        self.tags = TagsClient(self)
        self.places = PlacesClient(self)
        self.imports = ImportsClient(self)

    @property
    def token(self) -> str | None:
        return self._access_token

    @token.setter
    def token(self, value: str) -> None:
        self._access_token = value

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> TellingTreeClient:
        return self

    def __exit__(self, *args) -> None:
        self.close()

    def __repr__(self) -> str:
        authed = "authenticated" if self._access_token else "unauthenticated"
        return f"TellingTreeClient({self._base_url!r}, {authed})"
