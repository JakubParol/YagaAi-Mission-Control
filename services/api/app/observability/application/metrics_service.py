from datetime import datetime, timezone

from app.observability.application.ports import LangfuseRepositoryPort


class MetricsService:
    def __init__(self, repo: LangfuseRepositoryPort) -> None:
        self._repo = repo

    async def get_costs(self, from_str: str, to_str: str) -> dict:
        use_timestamps = "T" in from_str and "T" in to_str
        if use_timestamps:
            metrics = await self._repo.get_metrics_by_time_range(from_str, to_str)
        else:
            metrics = await self._repo.get_daily_metrics(from_str, to_str)

        date_map: dict[str, dict] = {}
        for m in metrics:
            if m.date not in date_map:
                date_map[m.date] = {
                    "date": m.date,
                    "totalCost": 0,
                    "countObservations": 0,
                    "usage": [],
                }
            entry = date_map[m.date]
            entry["totalCost"] += m.total_cost
            entry["countObservations"] += m.request_count
            entry["usage"].append(
                {
                    "model": m.model,
                    "inputUsage": m.input_tokens,
                    "outputUsage": m.output_tokens,
                    "totalUsage": m.total_tokens,
                    "totalCost": m.total_cost,
                    "countObservations": m.request_count,
                }
            )

        daily = sorted(date_map.values(), key=lambda x: x["date"])
        return {"daily": daily}

    async def get_import_status(self) -> dict:
        last_import = await self._repo.get_latest_import()
        counts = await self._repo.get_counts()

        import_data = None
        if last_import:
            import_data = {
                "id": last_import.id,
                "started_at": last_import.started_at,
                "finished_at": last_import.finished_at,
                "mode": last_import.mode,
                "from_timestamp": last_import.from_timestamp,
                "to_timestamp": last_import.to_timestamp,
                "status": last_import.status,
                "error_message": last_import.error_message,
            }

        return {
            "lastImport": import_data,
            "lastStatus": last_import.status if last_import else None,
            "counts": counts,
        }

    async def get_requests(
        self,
        page: int,
        limit: int,
        model: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict:
        result = await self._repo.get_requests(page, limit, model, from_date, to_date)

        data = []
        for r in result.data:
            data.append(
                {
                    "id": r.id,
                    "name": r.name,
                    "model": r.model,
                    "startTime": r.started_at or datetime.now(timezone.utc).isoformat(),
                    "endTime": r.finished_at,
                    "completionStartTime": None,
                    "inputTokens": r.input_tokens,
                    "outputTokens": r.output_tokens,
                    "totalTokens": r.total_tokens,
                    "cost": r.cost,
                    "latencyMs": r.latency_ms,
                    "metadata": None,
                }
            )

        total_pages = (result.total + limit - 1) // limit if limit > 0 else 0

        return {
            "data": data,
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": result.total,
                "totalPages": total_pages,
            },
        }

    async def get_distinct_models(self) -> list[str]:
        return await self._repo.get_distinct_models()
