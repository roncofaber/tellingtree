from __future__ import annotations

import uuid

from client._base import BaseClient
from app.schemas.tag import TagResponse


class TagsClient(BaseClient):

    def list(self, tree_id: uuid.UUID | str) -> list[TagResponse]:
        resp = self._get(f"/trees/{self._sid(tree_id)}/tags")
        return [TagResponse.model_validate(t) for t in resp.json()]

    def create(
        self,
        tree_id: uuid.UUID | str,
        name: str,
        color: str | None = None,
    ) -> TagResponse:
        data: dict = {"name": name}
        if color is not None:
            data["color"] = color
        resp = self._post(f"/trees/{self._sid(tree_id)}/tags", json=data)
        return TagResponse.model_validate(resp.json())

    def update(
        self,
        tree_id: uuid.UUID | str,
        tag_id: uuid.UUID | str,
        name: str | None = None,
        color: str | None = None,
    ) -> TagResponse:
        data: dict = {}
        if name is not None:
            data["name"] = name
        if color is not None:
            data["color"] = color
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/tags/{self._sid(tag_id)}", json=data
        )
        return TagResponse.model_validate(resp.json())

    def delete(
        self, tree_id: uuid.UUID | str, tag_id: uuid.UUID | str
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/tags/{self._sid(tag_id)}"
        )
