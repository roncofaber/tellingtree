from __future__ import annotations

import uuid
from datetime import date

from client._base import BaseClient
from app.schemas.common import PaginatedResponse
from app.schemas.story import StoryResponse


class StoriesClient(BaseClient):

    def list(
        self,
        tree_id: uuid.UUID | str,
        skip: int = 0,
        limit: int = 20,
        person_id: uuid.UUID | str | None = None,
        tag_id: uuid.UUID | str | None = None,
    ) -> PaginatedResponse[StoryResponse]:
        params: dict = {"skip": skip, "limit": limit}
        if person_id is not None:
            params["person_id"] = self._sid(person_id)
        if tag_id is not None:
            params["tag_id"] = self._sid(tag_id)
        resp = self._get(f"/trees/{self._sid(tree_id)}/stories", params=params)
        data = resp.json()
        data["items"] = [StoryResponse.model_validate(i) for i in data["items"]]
        return PaginatedResponse[StoryResponse].model_validate(data)

    def create(
        self,
        tree_id: uuid.UUID | str,
        title: str,
        content: str | None = None,
        event_date: date | str | None = None,
        event_end_date: date | str | None = None,
        event_location: str | None = None,
        person_ids: list[uuid.UUID | str] | None = None,
        tag_ids: list[uuid.UUID | str] | None = None,
    ) -> StoryResponse:
        data: dict = {"title": title}
        if content is not None:
            data["content"] = content
        if event_date is not None:
            data["event_date"] = str(event_date)
        if event_end_date is not None:
            data["event_end_date"] = str(event_end_date)
        if event_location is not None:
            data["event_location"] = event_location
        if person_ids:
            data["person_ids"] = [self._sid(p) for p in person_ids]
        if tag_ids:
            data["tag_ids"] = [self._sid(t) for t in tag_ids]
        resp = self._post(f"/trees/{self._sid(tree_id)}/stories", json=data)
        return StoryResponse.model_validate(resp.json())

    def get(
        self, tree_id: uuid.UUID | str, story_id: uuid.UUID | str
    ) -> StoryResponse:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
        )
        return StoryResponse.model_validate(resp.json())

    def update(
        self,
        tree_id: uuid.UUID | str,
        story_id: uuid.UUID | str,
        title: str | None = None,
        content: str | None = None,
        event_date: date | str | None = None,
        event_end_date: date | str | None = None,
        event_location: str | None = None,
    ) -> StoryResponse:
        data: dict = {}
        if title is not None:
            data["title"] = title
        if content is not None:
            data["content"] = content
        if event_date is not None:
            data["event_date"] = str(event_date)
        if event_end_date is not None:
            data["event_end_date"] = str(event_end_date)
        if event_location is not None:
            data["event_location"] = event_location
        resp = self._put(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}", json=data
        )
        return StoryResponse.model_validate(resp.json())

    def delete(
        self, tree_id: uuid.UUID | str, story_id: uuid.UUID | str
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
        )

    # --- Person linking ---

    def link_person(
        self,
        tree_id: uuid.UUID | str,
        story_id: uuid.UUID | str,
        person_id: uuid.UUID | str,
    ) -> None:
        self._post(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
            f"/persons/{self._sid(person_id)}"
        )

    def unlink_person(
        self,
        tree_id: uuid.UUID | str,
        story_id: uuid.UUID | str,
        person_id: uuid.UUID | str,
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
            f"/persons/{self._sid(person_id)}"
        )

    # --- Tag linking ---

    def add_tag(
        self,
        tree_id: uuid.UUID | str,
        story_id: uuid.UUID | str,
        tag_id: uuid.UUID | str,
    ) -> None:
        self._post(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
            f"/tags/{self._sid(tag_id)}"
        )

    def remove_tag(
        self,
        tree_id: uuid.UUID | str,
        story_id: uuid.UUID | str,
        tag_id: uuid.UUID | str,
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/stories/{self._sid(story_id)}"
            f"/tags/{self._sid(tag_id)}"
        )
