from __future__ import annotations

import uuid
from datetime import date

from client._base import BaseClient
from app.schemas.common import PaginatedResponse
from app.schemas.relationship import RelationshipResponse


class RelationshipsClient(BaseClient):

    def list(
        self, tree_id: uuid.UUID | str, skip: int = 0, limit: int = 20
    ) -> PaginatedResponse[RelationshipResponse]:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/relationships",
            params={"skip": skip, "limit": limit},
        )
        data = resp.json()
        data["items"] = [RelationshipResponse.model_validate(i) for i in data["items"]]
        return PaginatedResponse[RelationshipResponse].model_validate(data)

    def create(
        self,
        tree_id: uuid.UUID | str,
        person_a_id: uuid.UUID | str,
        person_b_id: uuid.UUID | str,
        relationship_type: str,
        start_date: date | str | None = None,
        end_date: date | str | None = None,
        notes: str | None = None,
    ) -> RelationshipResponse:
        data: dict = {
            "person_a_id": self._sid(person_a_id),
            "person_b_id": self._sid(person_b_id),
            "relationship_type": relationship_type,
        }
        if start_date is not None:
            data["start_date"] = str(start_date)
        if end_date is not None:
            data["end_date"] = str(end_date)
        if notes is not None:
            data["notes"] = notes
        resp = self._post(f"/trees/{self._sid(tree_id)}/relationships", json=data)
        return RelationshipResponse.model_validate(resp.json())

    def get(
        self, tree_id: uuid.UUID | str, relationship_id: uuid.UUID | str
    ) -> RelationshipResponse:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/relationships/{self._sid(relationship_id)}"
        )
        return RelationshipResponse.model_validate(resp.json())

    def update(
        self,
        tree_id: uuid.UUID | str,
        relationship_id: uuid.UUID | str,
        relationship_type: str | None = None,
        start_date: date | str | None = None,
        end_date: date | str | None = None,
        notes: str | None = None,
    ) -> RelationshipResponse:
        data: dict = {}
        if relationship_type is not None:
            data["relationship_type"] = relationship_type
        if start_date is not None:
            data["start_date"] = str(start_date)
        if end_date is not None:
            data["end_date"] = str(end_date)
        if notes is not None:
            data["notes"] = notes
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/relationships/{self._sid(relationship_id)}",
            json=data,
        )
        return RelationshipResponse.model_validate(resp.json())

    def delete(
        self, tree_id: uuid.UUID | str, relationship_id: uuid.UUID | str
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/relationships/{self._sid(relationship_id)}"
        )

    def list_for_person(
        self, tree_id: uuid.UUID | str, person_id: uuid.UUID | str
    ) -> list[RelationshipResponse]:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/persons/{self._sid(person_id)}/relationships"
        )
        return [RelationshipResponse.model_validate(r) for r in resp.json()]
