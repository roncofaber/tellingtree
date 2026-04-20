from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from client.client import TellingTreeClient


class BaseClient:
    def __init__(self, root: TellingTreeClient):
        self._root = root

    @property
    def _http(self) -> httpx.Client:
        return self._root._http

    @property
    def _base_url(self) -> str:
        return self._root._base_url

    def _headers(self) -> dict[str, str]:
        headers = {}
        if self._root._access_token:
            headers["Authorization"] = f"Bearer {self._root._access_token}"
        return headers

    def _url(self, path: str) -> str:
        return f"{self._base_url}/api/v1{path}"

    def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        resp = self._http.get(self._url(path), headers=self._headers(), params=params)
        resp.raise_for_status()
        return resp

    def _post(
        self, path: str, json: dict | None = None, **kwargs: Any
    ) -> httpx.Response:
        resp = self._http.post(
            self._url(path), headers=self._headers(), json=json, **kwargs
        )
        resp.raise_for_status()
        return resp

    def _put(self, path: str, json: dict) -> httpx.Response:
        resp = self._http.put(self._url(path), headers=self._headers(), json=json)
        resp.raise_for_status()
        return resp

    def _delete(self, path: str) -> httpx.Response:
        resp = self._http.delete(self._url(path), headers=self._headers())
        resp.raise_for_status()
        return resp

    def _delete_with_body(self, path: str, json: dict) -> httpx.Response:
        resp = self._http.request(
            "DELETE", self._url(path), headers=self._headers(), json=json
        )
        resp.raise_for_status()
        return resp

    @staticmethod
    def _sid(id: uuid.UUID | str) -> str:
        return str(id)
