from abc import ABC, abstractmethod

from app.orchestration.domain.models import (
    CommandEnvelope,
    OrchestrationHealthSnapshot,
    OrchestrationRun,
    OrchestrationStep,
    OutboxEventEnvelope,
    RunAttemptReadModel,
    RunReadModel,
    RunStatus,
    RunTimelineEntry,
    StepStatus,
    TimelineEntryReadModel,
)


class OrchestrationRepository(ABC):
    @abstractmethod
    async def create_command_with_outbox(
        self,
        *,
        command: CommandEnvelope,
        outbox_event: OutboxEventEnvelope,
    ) -> tuple[CommandEnvelope, OutboxEventEnvelope]: ...

    @abstractmethod
    async def get_outbox_event(self, *, outbox_event_id: str) -> OutboxEventEnvelope | None: ...

    @abstractmethod
    async def reschedule_outbox_event(
        self,
        *,
        outbox_event_id: str,
        retry_attempt: int,
        next_retry_at: str,
        last_error: str,
        payload: dict[str, object],
    ) -> None: ...

    @abstractmethod
    async def dead_letter_outbox_event(
        self,
        *,
        outbox_event_id: str,
        dead_lettered_at: str,
        last_error: str,
        dead_letter_payload: dict[str, object],
    ) -> None: ...

    @abstractmethod
    async def get_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
    ) -> str | None: ...

    @abstractmethod
    async def upsert_consumer_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        last_message_id: str,
        updated_at: str,
    ) -> None: ...

    @abstractmethod
    async def is_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
    ) -> bool: ...

    @abstractmethod
    async def mark_message_processed(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None: ...

    @abstractmethod
    async def mark_message_processed_and_checkpoint(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        message_id: str,
        correlation_id: str,
        processed_at: str,
    ) -> None: ...

    @abstractmethod
    async def get_run(self, *, run_id: str) -> OrchestrationRun | None: ...

    @abstractmethod
    async def create_run(self, *, run: OrchestrationRun) -> None: ...

    @abstractmethod
    async def update_run_status(
        self,
        *,
        run_id: str,
        status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None: ...

    @abstractmethod
    async def list_in_flight_runs(self) -> list[OrchestrationRun]: ...

    @abstractmethod
    async def get_step(self, *, run_id: str, step_id: str) -> OrchestrationStep | None: ...

    @abstractmethod
    async def create_step(self, *, step: OrchestrationStep) -> None: ...

    @abstractmethod
    async def update_step_status(
        self,
        *,
        run_id: str,
        step_id: str,
        status: StepStatus,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
    ) -> None: ...

    @abstractmethod
    async def append_timeline_entry(self, *, entry: RunTimelineEntry) -> None: ...

    @abstractmethod
    async def compare_and_set_run_lease(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        lease_owner: str | None,
        new_lease_token: str | None,
        heartbeat_at: str | None,
        timeout_at: str | None,
        updated_at: str,
    ) -> bool: ...

    @abstractmethod
    async def apply_watchdog_action_if_lease_matches(
        self,
        *,
        run_id: str,
        expected_lease_token: str | None,
        next_status: RunStatus,
        current_step_id: str | None,
        last_event_type: str,
        updated_at: str,
        terminal_at: str | None,
        watchdog_attempt: int,
        watchdog_state: str,
        clear_lease: bool,
    ) -> bool: ...

    @abstractmethod
    async def list_runs(
        self,
        *,
        run_id: str | None,
        status: RunStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[list[RunReadModel], int]: ...

    @abstractmethod
    async def get_run_read_model(self, *, run_id: str) -> RunReadModel | None: ...

    @abstractmethod
    async def list_timeline_entries(
        self,
        *,
        run_id: str | None,
        run_status: RunStatus | None,
        event_type: str | None,
        occurred_after: str | None,
        occurred_before: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TimelineEntryReadModel], int]: ...

    @abstractmethod
    async def list_run_attempts(
        self,
        *,
        run_id: str,
        limit: int,
        offset: int,
    ) -> tuple[list[RunAttemptReadModel], int]: ...

    @abstractmethod
    async def get_health_snapshot(self) -> OrchestrationHealthSnapshot: ...
