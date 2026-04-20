from __future__ import annotations

import uuid

from client._base import BaseClient
from app.schemas.common import PaginatedResponse
from app.schemas.tree import TreeMemberResponse, TreeResponse


class TreesClient(BaseClient):

    def list(self, skip: int = 0, limit: int = 20) -> PaginatedResponse[TreeResponse]:
        resp = self._get("/trees", params={"skip": skip, "limit": limit})
        data = resp.json()
        data["items"] = [TreeResponse.model_validate(i) for i in data["items"]]
        return PaginatedResponse[TreeResponse].model_validate(data)

    def create(
        self,
        name: str,
        description: str | None = None,
        is_public: bool = False,
    ) -> TreeResponse:
        resp = self._post("/trees", json={
            "name": name,
            "description": description,
            "is_public": is_public,
        })
        return TreeResponse.model_validate(resp.json())

    def get(self, tree_id: uuid.UUID | str) -> TreeResponse:
        resp = self._get(f"/trees/{self._sid(tree_id)}")
        return TreeResponse.model_validate(resp.json())

    def update(
        self,
        tree_id: uuid.UUID | str,
        name: str | None = None,
        description: str | None = None,
        is_public: bool | None = None,
    ) -> TreeResponse:
        data = {}
        if name is not None:
            data["name"] = name
        if description is not None:
            data["description"] = description
        if is_public is not None:
            data["is_public"] = is_public
        resp = self._put(f"/trees/{self._sid(tree_id)}", json=data)
        return TreeResponse.model_validate(resp.json())

    def delete(self, tree_id: uuid.UUID | str) -> None:
        self._delete(f"/trees/{self._sid(tree_id)}")

    def transfer(
        self,
        tree_id: uuid.UUID | str,
        new_owner_id: uuid.UUID | str,
    ) -> TreeResponse:
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/transfer",
            json={"new_owner_id": self._sid(new_owner_id)},
        )
        return TreeResponse.model_validate(resp.json())

    # --- Members ---

    def list_members(self, tree_id: uuid.UUID | str) -> list[TreeMemberResponse]:
        resp = self._get(f"/trees/{self._sid(tree_id)}/members")
        return [TreeMemberResponse.model_validate(m) for m in resp.json()]

    def add_member(
        self,
        tree_id: uuid.UUID | str,
        username: str,
        role: str = "viewer",
    ) -> TreeMemberResponse:
        resp = self._post(
            f"/trees/{self._sid(tree_id)}/members",
            json={"username": username, "role": role},
        )
        return TreeMemberResponse.model_validate(resp.json())

    def update_member(
        self,
        tree_id: uuid.UUID | str,
        user_id: uuid.UUID | str,
        role: str,
    ) -> TreeMemberResponse:
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/members/{self._sid(user_id)}",
            json={"role": role},
        )
        return TreeMemberResponse.model_validate(resp.json())

    def remove_member(
        self, tree_id: uuid.UUID | str, user_id: uuid.UUID | str
    ) -> None:
        self._delete(f"/trees/{self._sid(tree_id)}/members/{self._sid(user_id)}")
