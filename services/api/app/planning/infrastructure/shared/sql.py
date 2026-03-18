from typing import Any

from sqlalchemy import Result


def affected_rows(result: Result[Any]) -> int:
    """Extract rowcount from a SQLAlchemy Result in a pyright-safe way."""
    return getattr(result, "rowcount", 0)
