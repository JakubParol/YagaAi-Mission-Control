import asyncio
import base64
import json
import logging

import httpx

from app.observability.application.ports import LangfuseClientPort

logger = logging.getLogger(__name__)

OBSERVATIONS_PAGE_SIZE = 1000
MAX_RETRIES = 3
BASE_RETRY_DELAY_S = 1.0


class HttpLangfuseClient(LangfuseClientPort):
    def __init__(self, host: str, public_key: str, secret_key: str) -> None:
        self._host = host.rstrip("/")
        credentials = f"{public_key}:{secret_key}"
        self._auth_header = f"Basic {base64.b64encode(credentials.encode()).decode()}"

    async def fetch_daily_metrics(self, from_date: str, to_date: str) -> list[dict]:
        query = {
            "view": "observations",
            "metrics": [
                {"measure": "totalCost", "aggregation": "sum"},
                {"measure": "inputTokens", "aggregation": "sum"},
                {"measure": "outputTokens", "aggregation": "sum"},
                {"measure": "totalTokens", "aggregation": "sum"},
                {"measure": "count", "aggregation": "count"},
            ],
            "dimensions": [{"field": "providedModelName"}],
            "timeDimension": {"granularity": "day"},
            "fromTimestamp": f"{from_date}T00:00:00Z",
            "toTimestamp": f"{to_date}T23:59:59Z",
            "filters": [],
        }

        url = f"{self._host}/api/public/metrics"
        params = {"query": json.dumps(query)}

        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await self._fetch_with_retry(client, url, params, "metrics")
            res.raise_for_status()
            data = res.json()
            return data.get("data", [])

    async def fetch_all_observations(self, from_timestamp: str | None = None) -> list[dict]:
        all_observations: list[dict] = []
        cursor: str | None = None
        page_num = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                params: dict[str, str] = {
                    "type": "GENERATION",
                    "limit": str(OBSERVATIONS_PAGE_SIZE),
                    "fields": "core,basic,usage,model",
                }
                if from_timestamp:
                    params["fromStartTime"] = from_timestamp
                if cursor:
                    params["cursor"] = cursor

                page_num += 1
                url = f"{self._host}/api/public/v2/observations"
                res = await self._fetch_with_retry(
                    client, url, params, f"observations (page {page_num})"
                )
                res.raise_for_status()

                body = res.json()
                data = body.get("data", [])
                all_observations.extend(data)

                meta = body.get("meta", {})
                next_cursor = meta.get("cursor") if meta else None
                if not next_cursor or not data:
                    break
                cursor = next_cursor

        return all_observations

    async def _fetch_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: dict,
        label: str,
    ) -> httpx.Response:
        headers = {"Authorization": self._auth_header}

        for attempt in range(MAX_RETRIES + 1):
            res = await client.get(url, params=params, headers=headers)

            if res.status_code != 429 or attempt == MAX_RETRIES:
                return res

            retry_after = res.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else BASE_RETRY_DELAY_S * (2**attempt)

            logger.info(
                "[Langfuse] %s returned 429, retrying in %.1fs (attempt %d/%d)",
                label,
                delay,
                attempt + 1,
                MAX_RETRIES,
            )
            await asyncio.sleep(delay)

        raise RuntimeError(f"[Langfuse] {label} exceeded max retries")
