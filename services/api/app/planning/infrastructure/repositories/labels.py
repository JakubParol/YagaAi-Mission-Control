from typing import Any
from typing import cast as type_cast

from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import count

from app.planning.application.ports import LabelRepository
from app.planning.domain.models import Label
from app.planning.infrastructure.shared.mappers import _row_to_label
from app.planning.infrastructure.tables import labels


class DbLabelRepository(LabelRepository):
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_all(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Label], int]:
        conditions = []
        if filter_global:
            conditions.append(labels.c.project_id.is_(None))
        elif project_id:
            conditions.append((labels.c.project_id == project_id) | labels.c.project_id.is_(None))

        count_q = select(count()).select_from(labels)
        select_q = select(labels)
        for cond in conditions:
            count_q = count_q.where(cond)
            select_q = select_q.where(cond)
        select_q = select_q.order_by(labels.c.name.asc()).limit(limit).offset(offset)

        total = (await self._db.execute(count_q)).scalar_one()
        rows = (await self._db.execute(select_q)).mappings().all()
        return [_row_to_label(r) for r in rows], total

    async def get_by_id(self, label_id: str) -> Label | None:
        row = (
            (await self._db.execute(select(labels).where(labels.c.id == label_id)))
            .mappings()
            .first()
        )
        return _row_to_label(row) if row else None

    async def name_exists(self, name: str, project_id: str | None) -> bool:
        q = select(labels.c.id).where(labels.c.name == name)
        if project_id:
            q = q.where(labels.c.project_id == project_id)
        else:
            q = q.where(labels.c.project_id.is_(None))
        row = (await self._db.execute(q)).first()
        return row is not None

    async def create(self, label: Label) -> Label:
        await self._db.execute(
            insert(labels).values(
                id=label.id,
                project_id=label.project_id,
                name=label.name,
                color=label.color,
                created_at=label.created_at,
            )
        )
        await self._db.commit()
        return label

    async def update(self, label_id: str, data: dict[str, Any]) -> Label | None:
        values = {k: v for k, v in data.items() if k in ("name", "color")}
        if not values:
            return await self.get_by_id(label_id)

        await self._db.execute(update(labels).where(labels.c.id == label_id).values(**values))
        await self._db.commit()
        return await self.get_by_id(label_id)

    async def delete(self, label_id: str) -> bool:
        result = type_cast(
            CursorResult, await self._db.execute(delete(labels).where(labels.c.id == label_id))
        )
        await self._db.commit()
        return (result.rowcount or 0) > 0
