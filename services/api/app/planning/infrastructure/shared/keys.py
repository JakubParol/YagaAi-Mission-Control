from app.planning.infrastructure.shared.sql import DbConnection, _exists, _fetch_one
from app.shared.api.errors import ValidationError
from app.shared.utils import utc_now


async def _allocate_next_key(db: DbConnection, project_id: str) -> str:
    row = await _fetch_one(db, "SELECT key FROM projects WHERE id = ?", [project_id])
    if not row:
        raise ValidationError(f"Project {project_id} does not exist")
    project_key = row["key"]

    counter_row = await _fetch_one(
        db,
        "SELECT next_number FROM project_counters WHERE project_id = ?",
        [project_id],
    )
    if not counter_row:
        raise ValidationError(f"No counter found for project {project_id}")

    next_num = counter_row["next_number"]
    await db.execute(
        """UPDATE project_counters
           SET next_number = next_number + 1, updated_at = ?
           WHERE project_id = ?""",
        [utc_now(), project_id],
    )
    await db.commit()
    return f"{project_key}-{next_num}"


async def _project_exists(db: DbConnection, project_id: str) -> bool:
    return await _exists(db, "SELECT 1 FROM projects WHERE id = ?", [project_id])
