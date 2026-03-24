"""In-memory fakes for OpenClawDispatchPort."""

from app.control_plane.application.ports import OpenClawDispatchPort
from app.control_plane.domain.models import DispatchEnvelope, OpenClawSessionMetadata


class FakeOpenClawAdapter(OpenClawDispatchPort):
    def __init__(self) -> None:
        self.dispatch_count: int = 0
        self.last_envelope: DispatchEnvelope | None = None

    async def send_dispatch(self, *, envelope: DispatchEnvelope) -> OpenClawSessionMetadata:
        self.dispatch_count += 1
        self.last_envelope = envelope
        return OpenClawSessionMetadata(process_id=12345)


class FailingOpenClawAdapter(OpenClawDispatchPort):
    def __init__(self, error: str = "dispatch failed") -> None:
        self._error = error

    async def send_dispatch(self, *, envelope: DispatchEnvelope) -> OpenClawSessionMetadata:
        raise RuntimeError(self._error)
