from collections.abc import Mapping
from typing import Any

from sqlalchemy import ColumnElement, asc, desc

from app.shared.api.errors import ValidationError


def parse_sort(raw: str, allowed: Mapping[str, ColumnElement[Any]]) -> list[ColumnElement[Any]]:
    clauses: list[ColumnElement[Any]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.startswith("-"):
            field = part[1:]
            direction = desc
        else:
            field = part
            direction = asc
        col = allowed.get(field)
        if col is None:
            raise ValidationError(
                f"Invalid sort field '{field}'. Allowed: {', '.join(sorted(allowed.keys()))}"
            )
        clauses.append(direction(col))
    return clauses
