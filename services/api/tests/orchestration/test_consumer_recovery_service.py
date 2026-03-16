import pytest

from app.orchestration.application.consumer_recovery_service import ConsumerRecoveryService
from app.orchestration.infrastructure.repositories.consumer import DbConsumerRepository
from app.shared.db.session import get_session_factory


@pytest.mark.asyncio
async def test_get_resume_offset_defaults_to_zero() -> None:
    async with get_session_factory()() as session:
        repo = DbConsumerRepository(session)
        service = ConsumerRecoveryService(repo=repo)
        offset = await service.get_resume_offset(
            stream_key="mc:orchestration:events:topic:v1:p0",
            consumer_group="orchestration-workers-v1",
            consumer_name="worker-a",
        )
    assert offset == "0-0"


@pytest.mark.asyncio
async def test_mark_processed_and_checkpoint_enables_idempotent_recovery() -> None:
    async with get_session_factory()() as session:
        repo = DbConsumerRepository(session)
        service = ConsumerRecoveryService(repo=repo)

        await service.mark_processed_and_checkpoint(
            stream_key="mc:orchestration:events:topic:v1:p0",
            consumer_group="orchestration-workers-v1",
            consumer_name="worker-a",
            message_id="1710000000000-9",
            correlation_id="corr-1",
        )

        duplicate = await service.is_duplicate_delivery(
            stream_key="mc:orchestration:events:topic:v1:p0",
            consumer_group="orchestration-workers-v1",
            message_id="1710000000000-9",
        )
        resume_offset = await service.get_resume_offset(
            stream_key="mc:orchestration:events:topic:v1:p0",
            consumer_group="orchestration-workers-v1",
            consumer_name="worker-a",
        )

    assert duplicate is True
    assert resume_offset == "1710000000000-9"
