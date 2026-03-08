from collections.abc import Sequence
from typing import Any
from unittest.mock import patch

import httpx


class _FakeAsyncClient:
    def __init__(
        self,
        *,
        get_responses: Sequence[httpx.Response] | None = None,
        post_responses: Sequence[httpx.Response] | None = None,
        get_error: Exception | None = None,
        post_error: Exception | None = None,
    ) -> None:
        self._get_responses = list(get_responses or [])
        self._post_responses = list(post_responses or [])
        self._get_error = get_error
        self._post_error = post_error
        self.get_calls: list[tuple[str, dict[str, Any]]] = []
        self.post_calls: list[tuple[str, dict[str, Any]]] = []

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        self.get_calls.append((url, kwargs))
        if self._get_error is not None:
            raise self._get_error
        if not self._get_responses:
            return httpx.Response(200, request=httpx.Request("GET", url), json={})
        return self._get_responses.pop(0)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self.post_calls.append((url, kwargs))
        if self._post_error is not None:
            raise self._post_error
        if not self._post_responses:
            return httpx.Response(204, request=httpx.Request("POST", url))
        return self._post_responses.pop(0)


def test_dapr_subscribe_contract(client) -> None:
    response = client.get("/dapr/subscribe")
    assert response.status_code == 200

    data = response.json()
    assert data == [
        {
            "pubsubname": "local-pubsub",
            "topic": "orchestration.events",
            "routes": {"default": "v1/orchestration/dapr/events"},
        }
    ]


def test_dapr_healthz_success(client) -> None:
    fake = _FakeAsyncClient(
        get_responses=[
            httpx.Response(200, request=httpx.Request("GET", "http://127.0.0.1:3500/v1.0/metadata"))
        ]
    )
    with patch("app.orchestration.api.dapr_router.httpx.AsyncClient", return_value=fake):
        response = client.get("/healthz/dapr")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert fake.get_calls


def test_dapr_healthz_failure_returns_503(client) -> None:
    fake = _FakeAsyncClient(get_error=httpx.ConnectError("connection refused"))
    with patch("app.orchestration.api.dapr_router.httpx.AsyncClient", return_value=fake):
        response = client.get("/healthz/dapr")

    assert response.status_code == 503
    assert "Dapr sidecar metadata unavailable" in response.json()["detail"]


def test_dapr_event_bridge_persists_state_and_invokes_worker(client) -> None:
    invoke_url = "".join(
        [
            "http://127.0.0.1:3500/v1.0/invoke/mission-control-worker/",
            "method/orchestration/ack",
        ]
    )
    fake = _FakeAsyncClient(
        post_responses=[
            httpx.Response(
                204,
                request=httpx.Request("POST", "http://127.0.0.1:3500/v1.0/state/local-statestore"),
            ),
            httpx.Response(
                200,
                request=httpx.Request(
                    "POST",
                    invoke_url,
                ),
            ),
        ]
    )
    with patch("app.orchestration.api.dapr_router.httpx.AsyncClient", return_value=fake):
        response = client.post(
            "/v1/orchestration/dapr/events",
            json={
                "id": "cloud-1",
                "traceid": "trace-1",
                "data": {
                    "run_id": "run-42",
                    "correlation_id": "corr-42",
                    "occurred_at": "2026-03-08T12:00:00Z",
                },
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["run_id"] == "run-42"
    assert len(fake.post_calls) == 2
    assert fake.post_calls[0][0].endswith("/v1.0/state/local-statestore")
    assert fake.post_calls[1][0].endswith("/method/orchestration/ack")


def test_dapr_event_bridge_failure_returns_503(client) -> None:
    fake = _FakeAsyncClient(
        post_responses=[
            httpx.Response(
                500,
                request=httpx.Request("POST", "http://127.0.0.1:3500/v1.0/state/local-statestore"),
            )
        ]
    )
    with patch("app.orchestration.api.dapr_router.httpx.AsyncClient", return_value=fake):
        response = client.post(
            "/v1/orchestration/dapr/events",
            json={"data": {"run_id": "run-500", "correlation_id": "corr-500"}},
        )

    assert response.status_code == 503
    assert "Failed to persist orchestration event in Dapr state store" in response.json()["detail"]
