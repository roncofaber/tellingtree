from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

from client._base import BaseClient
from app.schemas.media import MediaResponse


class MediaClient(BaseClient):

    def upload(
        self,
        tree_id: uuid.UUID | str,
        file_path: str | Path,
        story_id: uuid.UUID | str | None = None,
        person_id: uuid.UUID | str | None = None,
        caption: str | None = None,
    ) -> MediaResponse:
        path = Path(file_path)
        mime_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"

        data: dict = {}
        if story_id is not None:
            data["story_id"] = self._sid(story_id)
        if person_id is not None:
            data["person_id"] = self._sid(person_id)
        if caption is not None:
            data["caption"] = caption

        with open(path, "rb") as f:
            files = {"file": (path.name, f, mime_type)}
            resp = self._http.post(
                self._url(f"/trees/{self._sid(tree_id)}/media"),
                headers=self._headers(),
                data=data,
                files=files,
            )
        resp.raise_for_status()
        return MediaResponse.model_validate(resp.json())

    def get(
        self, tree_id: uuid.UUID | str, media_id: uuid.UUID | str
    ) -> MediaResponse:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/media/{self._sid(media_id)}"
        )
        return MediaResponse.model_validate(resp.json())

    def download(
        self,
        tree_id: uuid.UUID | str,
        media_id: uuid.UUID | str,
        dest_path: str | Path,
    ) -> Path:
        resp = self._get(
            f"/trees/{self._sid(tree_id)}/media/{self._sid(media_id)}/download"
        )
        dest = Path(dest_path)
        dest.write_bytes(resp.content)
        return dest

    def delete(
        self, tree_id: uuid.UUID | str, media_id: uuid.UUID | str
    ) -> None:
        self._delete(
            f"/trees/{self._sid(tree_id)}/media/{self._sid(media_id)}"
        )
