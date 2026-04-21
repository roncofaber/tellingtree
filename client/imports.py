from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from client._base import BaseClient


@dataclass
class ImportResult:
    persons_created: int
    relationships_created: int
    skipped: int
    duplicates_skipped: int
    errors: list[str]


class ImportsClient(BaseClient):

    def gedcom(
        self,
        tree_id: uuid.UUID | str,
        file: Path | str,
    ) -> ImportResult:
        """Import a GEDCOM 5.5.1 file into the given tree.

        Args:
            tree_id: Target tree UUID.
            file: Path to a .ged file on disk.

        Returns:
            ImportResult with counts of created records and any errors.
        """
        path = Path(file)
        with path.open("rb") as fh:
            resp = self._post(
                f"/trees/{self._sid(tree_id)}/import/gedcom",
                files={"file": (path.name, fh, "application/octet-stream")},
            )
        data = resp.json()
        return ImportResult(
            persons_created=data["persons_created"],
            relationships_created=data["relationships_created"],
            skipped=data["skipped"],
            duplicates_skipped=data.get("duplicates_skipped", 0),
            errors=data["errors"],
        )
