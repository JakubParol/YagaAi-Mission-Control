import logging
from datetime import datetime, timedelta, timezone

from app.observability.application.ports import LangfuseClientPort, LangfuseRepositoryPort
from app.observability.domain.models import DailyMetric, ImportRecord, LangfuseRequest

logger = logging.getLogger(__name__)

FULL_IMPORT_LOOKBACK_DAYS = 90


class ImportService:
    def __init__(self, repo: LangfuseRepositoryPort, client: LangfuseClientPort) -> None:
        self._repo = repo
        self._client = client

    async def run_import(self) -> dict:
        last_import = await self._repo.get_last_successful_import()
        from_timestamp, from_date, to_date, to_timestamp, mode = self._resolve_import_range(
            last_import
        )

        import_run = await self._repo.create_import_run(mode, from_timestamp, to_timestamp)

        try:
            raw_metrics = await self._client.fetch_daily_metrics(from_date, to_date)
            daily_metrics = self._transform_daily_metrics(raw_metrics)
            await self._repo.upsert_daily_metrics(daily_metrics)

            raw_observations = await self._client.fetch_all_observations(from_timestamp)
            requests = self._transform_observations(raw_observations)
            await self._repo.upsert_requests(requests)

            await self._repo.complete_import_run(import_run.id, "success")

            return {
                **_import_record_to_dict(import_run),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": "success",
            }
        except Exception as err:
            logger.exception("Langfuse import failed")
            error_message = str(err)
            await self._repo.complete_import_run(import_run.id, "failed", error_message)
            raise

    @staticmethod
    def _resolve_import_range(
        last_import: ImportRecord | None,
    ) -> tuple[str | None, str, str, str, str]:
        """Return (from_timestamp, from_date, to_date, to_timestamp, mode)."""
        now = datetime.now(timezone.utc)
        to_timestamp = now.isoformat()
        to_date = now.isoformat().split("T")[0]

        if last_import is not None:
            from_timestamp: str | None = last_import.to_timestamp
            from_date = last_import.to_timestamp.split("T")[0]
            mode = "incremental"
        else:
            from_timestamp = None
            lookback = now - timedelta(days=FULL_IMPORT_LOOKBACK_DAYS)
            from_date = lookback.isoformat().split("T")[0]
            mode = "full"

        return from_timestamp, from_date, to_date, to_timestamp, mode

    @staticmethod
    def _transform_daily_metrics(raw: list[dict]) -> list[DailyMetric]:
        return [
            DailyMetric(
                date=row.get("time_dimension", "").split("T")[0],
                model=row.get("providedModelName") or "unknown",
                input_tokens=int(row.get("sum_inputTokens") or 0),
                output_tokens=int(row.get("sum_outputTokens") or 0),
                total_tokens=int(row.get("sum_totalTokens") or 0),
                request_count=int(row.get("count_count") or 0),
                total_cost=row.get("sum_totalCost") or 0,
            )
            for row in raw
        ]

    @staticmethod
    def _transform_observations(raw: list[dict]) -> list[LangfuseRequest]:
        results: list[LangfuseRequest] = []
        for obs in raw:
            latency_ms: int | None = None
            if obs.get("latency") is not None:
                latency_ms = round(obs["latency"] * 1000)
            elif obs.get("startTime") and obs.get("endTime"):
                start = datetime.fromisoformat(obs["startTime"].replace("Z", "+00:00"))
                end = datetime.fromisoformat(obs["endTime"].replace("Z", "+00:00"))
                latency_ms = int((end - start).total_seconds() * 1000)

            results.append(
                LangfuseRequest(
                    id=obs["id"],
                    trace_id=obs.get("traceId"),
                    name=obs.get("name"),
                    model=obs.get("model"),
                    started_at=obs.get("startTime"),
                    finished_at=obs.get("endTime"),
                    input_tokens=obs.get("inputUsage") or 0,
                    output_tokens=obs.get("outputUsage") or 0,
                    total_tokens=obs.get("totalUsage") or 0,
                    cost=obs.get("totalCost"),
                    latency_ms=latency_ms,
                )
            )
        return results


def _import_record_to_dict(record: ImportRecord) -> dict:
    return {
        "id": record.id,
        "started_at": record.started_at,
        "finished_at": record.finished_at,
        "mode": record.mode,
        "from_timestamp": record.from_timestamp,
        "to_timestamp": record.to_timestamp,
        "status": record.status,
        "error_message": record.error_message,
    }
