from pydantic import BaseModel


class ImportResponse(BaseModel):
    persons_created: int
    relationships_created: int
    skipped: int
    duplicates_skipped: int
    errors: list[str]
