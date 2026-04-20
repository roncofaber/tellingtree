RELATIONSHIP_TYPES: dict[str, dict[str, str]] = {
    "parent": {"label": "Parent", "inverse": "child"},
    "child":  {"label": "Child",  "inverse": "parent"},
    "spouse": {"label": "Spouse", "inverse": "spouse"},
}


def get_inverse(rel_type: str) -> str | None:
    entry = RELATIONSHIP_TYPES.get(rel_type)
    return entry["inverse"] if entry else None
