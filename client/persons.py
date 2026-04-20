from __future__ import annotations

import uuid
from datetime import date

from client._base import BaseClient
from app.schemas.common import PaginatedResponse
from app.schemas.person import PersonResponse


def _person_payload(**kwargs) -> dict:
    """Build a dict of only the explicitly-provided (non-None) person fields."""
    date_fields = {"birth_date", "death_date", "birth_date_2", "death_date_2"}
    return {k: (str(v) if k in date_fields else v) for k, v in kwargs.items() if v is not None}


class PersonsClient(BaseClient):

    def list(
        self,
        tree_id: uuid.UUID | str,
        skip: int = 0,
        limit: int = 20,
    ) -> PaginatedResponse[PersonResponse]:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/persons",
            params={"skip": skip, "limit": limit},
        )
        data = resp.json()
        data["items"] = [PersonResponse.model_validate(i) for i in data["items"]]
        return PaginatedResponse[PersonResponse].model_validate(data)

    def create(
        self,
        tree_id: uuid.UUID | str,
        *,
        given_name: str | None = None,
        family_name: str | None = None,
        maiden_name: str | None = None,
        nickname: str | None = None,
        birth_date: date | str | None = None,
        birth_date_qualifier: str | None = None,
        birth_date_2: date | str | None = None,
        birth_date_original: str | None = None,
        death_date: date | str | None = None,
        death_date_qualifier: str | None = None,
        death_date_2: date | str | None = None,
        death_date_original: str | None = None,
        birth_location: str | None = None,
        birth_place_id: uuid.UUID | str | None = None,
        death_location: str | None = None,
        death_place_id: uuid.UUID | str | None = None,
        gender: str | None = None,
        is_living: bool | None = None,
        occupation: str | None = None,
        nationalities: list[str] | None = None,
        education: str | None = None,
        bio: str | None = None,
        profile_picture_id: uuid.UUID | str | None = None,
    ) -> PersonResponse:
        resp = self._post(
            f"/trees/{self._sid(tree_id)}/persons",
            json=_person_payload(
                given_name=given_name, family_name=family_name,
                maiden_name=maiden_name, nickname=nickname,
                birth_date=birth_date, birth_date_qualifier=birth_date_qualifier,
                birth_date_2=birth_date_2, birth_date_original=birth_date_original,
                death_date=death_date, death_date_qualifier=death_date_qualifier,
                death_date_2=death_date_2, death_date_original=death_date_original,
                birth_location=birth_location, birth_place_id=birth_place_id,
                death_location=death_location, death_place_id=death_place_id,
                gender=gender, is_living=is_living, occupation=occupation,
                nationalities=nationalities, education=education, bio=bio,
                profile_picture_id=profile_picture_id,
            ),
        )
        return PersonResponse.model_validate(resp.json())

    def get(
        self,
        tree_id: uuid.UUID | str,
        person_id: uuid.UUID | str,
    ) -> PersonResponse:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/persons/{self._sid(person_id)}"
        )
        return PersonResponse.model_validate(resp.json())

    def update(
        self,
        tree_id: uuid.UUID | str,
        person_id: uuid.UUID | str,
        *,
        given_name: str | None = None,
        family_name: str | None = None,
        maiden_name: str | None = None,
        nickname: str | None = None,
        birth_date: date | str | None = None,
        birth_date_qualifier: str | None = None,
        birth_date_2: date | str | None = None,
        birth_date_original: str | None = None,
        death_date: date | str | None = None,
        death_date_qualifier: str | None = None,
        death_date_2: date | str | None = None,
        death_date_original: str | None = None,
        birth_location: str | None = None,
        birth_place_id: uuid.UUID | str | None = None,
        death_location: str | None = None,
        death_place_id: uuid.UUID | str | None = None,
        gender: str | None = None,
        is_living: bool | None = None,
        occupation: str | None = None,
        nationalities: list[str] | None = None,
        education: str | None = None,
        bio: str | None = None,
        profile_picture_id: uuid.UUID | str | None = None,
    ) -> PersonResponse:
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/persons/{self._sid(person_id)}",
            json=_person_payload(
                given_name=given_name, family_name=family_name,
                maiden_name=maiden_name, nickname=nickname,
                birth_date=birth_date, birth_date_qualifier=birth_date_qualifier,
                birth_date_2=birth_date_2, birth_date_original=birth_date_original,
                death_date=death_date, death_date_qualifier=death_date_qualifier,
                death_date_2=death_date_2, death_date_original=death_date_original,
                birth_location=birth_location, birth_place_id=birth_place_id,
                death_location=death_location, death_place_id=death_place_id,
                gender=gender, is_living=is_living, occupation=occupation,
                nationalities=nationalities, education=education, bio=bio,
                profile_picture_id=profile_picture_id,
            ),
        )
        return PersonResponse.model_validate(resp.json())

    def delete(
        self,
        tree_id: uuid.UUID | str,
        person_id: uuid.UUID | str,
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/persons/{self._sid(person_id)}"
        )
