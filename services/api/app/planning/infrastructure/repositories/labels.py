from typing import Any

from app.planning.application.ports import LabelRepository
from app.planning.domain.models import Label
from app.planning.infrastructure.shared.mappers import _row_to_label
from app.planning.infrastructure.shared.sql import (
    DbConnection,
    _build_list_queries,
    _build_update_query,
    _exists,
    _fetch_all,
    _fetch_count,
    _fetch_one,
)


class DbLabelRepository(LabelRepository):
    def __init__(self, db: DbConnection) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Label], int]:
        where_parts: list[str] = []
        params: list[Any] = []

        if filter_global:
            where_parts.append("project_id IS NULL")
        elif project_id:
            where_parts.append("(project_id = ? OR project_id IS NULL)")
            params.append(project_id)

        count_q, select_q = _build_list_queries("labels", where_parts, "name ASC")

        total = await _fetch_count(self._db, count_q, params)
        rows = await _fetch_all(self._db, select_q, [*params, limit, offset])
        return [_row_to_label(r) for r in rows], total

    async def get_by_id(self, label_id: str) -> Label | None:
        row = await _fetch_one(self._db, "SELECT * FROM labels WHERE id = ?", [label_id])
        return _row_to_label(row) if row else None

    async def name_exists(self, name: str, project_id: str | None) -> bool:
        if project_id:
            return await _exists(
                self._db,
                "SELECT 1 FROM labels WHERE name = ? AND project_id = ?",
                [name, project_id],
            )
        return await _exists(
            self._db,
            "SELECT 1 FROM labels WHERE name = ? AND project_id IS NULL",
            [name],
        )

    async def create(self, label: Label) -> Label:
        await self._db.execute(
            """INSERT INTO labels (id, project_id, name, color, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            [label.id, label.project_id, label.name, label.color, label.created_at],
        )
        await self._db.commit()
        return label

    async def update(self, label_id: str, data: dict[str, Any]) -> Label | None:
        sets: list[str] = []
        params: list[Any] = []

        for field in ("name", "color"):
            if field not in data:
                continue
            sets.append(f"{field} = ?")
            params.append(data[field])

        if not sets:
            return await self.get_by_id(label_id)

        params.append(label_id)
        await self._db.execute(_build_update_query("labels", sets), params)
        await self._db.commit()
        return await self.get_by_id(label_id)

    async def delete(self, label_id: str) -> bool:
        cursor = await self._db.execute("DELETE FROM labels WHERE id = ?", [label_id])
        await self._db.commit()
        return (cursor.rowcount or 0) > 0
