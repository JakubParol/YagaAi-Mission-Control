"""In-memory fake for DispatchRecordRepository."""

from app.control_plane.application.ports import DispatchRecordRepository
from app.control_plane.domain.models import DispatchRecord


class FakeDispatchRecordRepo(DispatchRecordRepository):
    def __init__(self) -> None:
        self.records: list[DispatchRecord] = []

    async def create(self, *, record: DispatchRecord) -> None:
        self.records.append(record)

    async def get_by_queue_entry_id(self, *, queue_entry_id: str) -> DispatchRecord | None:
        for r in reversed(self.records):
            if r.queue_entry_id == queue_entry_id:
                return r
        return None

    async def commit(self) -> None:
        pass
