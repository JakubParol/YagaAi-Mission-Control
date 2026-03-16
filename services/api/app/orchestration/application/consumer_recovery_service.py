from app.orchestration.application.ports import ConsumerRepository
from app.shared.utils import utc_now


class ConsumerRecoveryService:
    def __init__(self, repo: ConsumerRepository) -> None:
        self._repo = repo

    async def get_resume_offset(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
    ) -> str:
        offset = await self._repo.get_consumer_offset(
            stream_key=stream_key,
            consumer_group=consumer_group,
            consumer_name=consumer_name,
        )
        return offset or "0-0"

    async def is_duplicate_delivery(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        message_id: str,
    ) -> bool:
        return await self._repo.is_message_processed(
            stream_key=stream_key,
            consumer_group=consumer_group,
            message_id=message_id,
        )

    async def mark_processed_and_checkpoint(
        self,
        *,
        stream_key: str,
        consumer_group: str,
        consumer_name: str,
        message_id: str,
        correlation_id: str,
    ) -> None:
        now = utc_now()
        await self._repo.mark_message_processed_and_checkpoint(
            stream_key=stream_key,
            consumer_group=consumer_group,
            consumer_name=consumer_name,
            message_id=message_id,
            correlation_id=correlation_id,
            processed_at=now,
        )
