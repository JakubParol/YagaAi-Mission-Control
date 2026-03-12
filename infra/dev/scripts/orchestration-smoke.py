#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable


@dataclass(frozen=True)
class ScenarioContext:
    run_id: str
    correlation_id: str
    service: str


class SmokeError(RuntimeError):
    def __init__(
        self,
        scenario: str,
        context: ScenarioContext,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.scenario = scenario
        self.context = context
        self.details = details or {}


def _utc_iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _run_command(cmd: list[str], *, cwd: Path | None = None, input_text: str | None = None) -> str:
    completed = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd is not None else None,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"command failed ({completed.returncode}): {' '.join(cmd)}\nstdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed.stdout


def _http_json(base_url: str, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        content = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} {method} {path}: {content}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"HTTP transport failure {method} {path}: {error}") from error


def _assert(
    condition: bool,
    scenario: str,
    context: ScenarioContext,
    message: str,
    **details: Any,
) -> None:
    if condition:
        return
    raise SmokeError(scenario, context, message, details)


def _print_event(event: str, *, scenario: str | None = None, status: str | None = None, **fields: Any) -> None:
    payload: dict[str, Any] = {
        "timestamp": _utc_iso(datetime.now(tz=UTC)),
        "event": event,
    }
    if scenario is not None:
        payload["scenario"] = scenario
    if status is not None:
        payload["status"] = status
    payload.update(fields)
    if "service" in payload and "component" not in payload:
        payload["component"] = payload["service"]
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True), flush=True)


def _create_command(base_url: str, *, run_id: str, correlation_id: str, occurred_at: str) -> dict[str, Any]:
    return _http_json(
        base_url,
        "POST",
        "/v1/orchestration/commands",
        {
            "command_type": "orchestration.run.submit",
            "schema_version": "1.0",
            "payload": {"run_id": run_id},
            "metadata": {
                "producer": "mc-smoke",
                "correlation_id": correlation_id,
                "causation_id": None,
                "occurred_at": occurred_at,
            },
        },
    )


def _publish_dapr_event(
    base_url: str,
    *,
    event_id: str,
    run_id: str,
    correlation_id: str,
    event_type: str,
    occurred_at: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return _http_json(
        base_url,
        "POST",
        "/v1/orchestration/dapr/events",
        {
            "id": event_id,
            "type": event_type,
            "source": "urn:mc:smoke",
            "specversion": "1.0",
            "time": occurred_at,
            "data": {
                "run_id": run_id,
                "type": event_type,
                "correlation_id": correlation_id,
                "occurred_at": occurred_at,
                "payload": payload,
            },
        },
    )


def _get_run(base_url: str, run_id: str) -> dict[str, Any]:
    return _http_json(base_url, "GET", f"/v1/orchestration/runs/{urllib.parse.quote(run_id, safe='')}")


def _get_attempts(base_url: str, run_id: str) -> dict[str, Any]:
    return _http_json(
        base_url,
        "GET",
        f"/v1/orchestration/runs/{urllib.parse.quote(run_id, safe='')}/attempts?limit=20",
    )


def _get_metrics(base_url: str) -> dict[str, Any]:
    return _http_json(base_url, "GET", "/v1/orchestration/metrics")


def _watchdog_sweep(base_url: str, *, evaluated_at: str) -> dict[str, Any]:
    return _http_json(
        base_url,
        "POST",
        "/v1/orchestration/watchdog/sweep",
        {"watchdog_instance": "smoke-suite", "evaluated_at": evaluated_at},
    )


def _cleanup_fixtures(compose_file: Path, runtime_dir: Path, *, run_ids: list[str], correlations: list[str]) -> None:
    cleanup_py = f"""
import os

run_ids = {json.dumps(run_ids)}
correlations = {json.dumps(correlations)}

engine = os.environ.get('MC_API_DB_ENGINE', 'sqlite').lower()

if engine == 'postgres':
    import psycopg

    dsn = os.environ.get('MC_API_POSTGRES_DSN') or os.environ.get('MC_POSTGRES_DSN')
    if not dsn:
        raise RuntimeError('postgres engine enabled but DSN not set')

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            for run_id in run_ids:
                cur.execute('DELETE FROM orchestration_run_steps WHERE run_id = %s', (run_id,))
                cur.execute('DELETE FROM orchestration_run_timeline WHERE run_id = %s', (run_id,))
                cur.execute('DELETE FROM orchestration_runs WHERE run_id = %s', (run_id,))
            for correlation_id in correlations:
                cur.execute('DELETE FROM orchestration_processed_messages WHERE correlation_id = %s', (correlation_id,))
                cur.execute('DELETE FROM orchestration_outbox WHERE correlation_id = %s', (correlation_id,))
                cur.execute('DELETE FROM orchestration_commands WHERE correlation_id = %s', (correlation_id,))
        conn.commit()
else:
    import sqlite3

    conn = sqlite3.connect('/runtime/sqlite/mission-control.db')
    try:
        conn.execute('PRAGMA foreign_keys = ON')
        for run_id in run_ids:
            conn.execute('DELETE FROM orchestration_run_steps WHERE run_id = ?', (run_id,))
            conn.execute('DELETE FROM orchestration_run_timeline WHERE run_id = ?', (run_id,))
            conn.execute('DELETE FROM orchestration_runs WHERE run_id = ?', (run_id,))
        for correlation_id in correlations:
            conn.execute('DELETE FROM orchestration_processed_messages WHERE correlation_id = ?', (correlation_id,))
            conn.execute('DELETE FROM orchestration_outbox WHERE correlation_id = ?', (correlation_id,))
            conn.execute('DELETE FROM orchestration_commands WHERE correlation_id = ?', (correlation_id,))
        conn.commit()
    finally:
        conn.close()
""".strip()
    _run_command(
        [
            "docker",
            "compose",
            "-f",
            str(compose_file),
            "--env-file",
            ".env",
            "exec",
            "-T",
            "api",
            "/bin/sh",
            "-lc",
            "cd /workspace/services/api && poetry run python -",
        ],
        cwd=runtime_dir,
        input_text=cleanup_py,
    )


def _record_processing_failure(
    compose_file: Path,
    runtime_dir: Path,
    *,
    outbox_event_id: str,
    source_stream: str,
    source_message_id: str,
    error_code: str,
    error_message: str,
    failed_at: str,
) -> dict[str, Any]:
    payload = {
        "outbox_event_id": outbox_event_id,
        "source_stream": source_stream,
        "source_message_id": source_message_id,
        "error_code": error_code,
        "error_message": error_message,
        "failed_at": failed_at,
    }
    runner_py = f"""
import asyncio
import json

from app.config import settings
from app.orchestration.application.delivery_service import DeliveryService
from app.orchestration.infrastructure.sqlite_repository import SqliteOrchestrationRepository
from app.shared.db.pg_compat import AsyncPgCompatConnection

payload = {json.dumps(payload)}

async def main() -> None:
    if settings.db_engine == 'postgres':
        db = await AsyncPgCompatConnection.connect(settings.postgres_dsn)
        try:
            repo = SqliteOrchestrationRepository(db)
            service = DeliveryService(repo=repo)
            result = await service.record_processing_failure(**payload)
            print(json.dumps(result, separators=(",", ":"), sort_keys=True))
        finally:
            await db.close()
        return

    import aiosqlite

    db = await aiosqlite.connect(settings.db_path)
    try:
        repo = SqliteOrchestrationRepository(db)
        service = DeliveryService(repo=repo)
        result = await service.record_processing_failure(**payload)
        print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    finally:
        await db.close()

asyncio.run(main())
""".strip()
    raw = _run_command(
        [
            "docker",
            "compose",
            "-f",
            str(compose_file),
            "--env-file",
            ".env",
            "exec",
            "-T",
            "api",
            "/bin/sh",
            "-lc",
            "cd /workspace/services/api && poetry run python -",
        ],
        cwd=runtime_dir,
        input_text=runner_py,
    ).strip()

    lines = [line for line in raw.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("delivery failure hook returned no output")
    return json.loads(lines[-1])


def _extract_outbox_event_id(
    response: dict[str, Any],
    scenario: str,
    context: ScenarioContext,
) -> str:
    data = response.get("data") if isinstance(response, dict) else None
    outbox = data.get("outbox_event") if isinstance(data, dict) else None
    outbox_id = outbox.get("id") if isinstance(outbox, dict) else None
    _assert(isinstance(outbox_id, str) and bool(outbox_id), scenario, context, "command response missing outbox_event.id")
    return outbox_id


def _seed_pending_run(base_url: str, *, context: ScenarioContext, started_at: datetime, run_type: str = "DEFAULT") -> str:
    response = _create_command(
        base_url,
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        occurred_at=_utc_iso(started_at),
    )
    _publish_dapr_event(
        base_url,
        event_id=f"{context.run_id}-accepted",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        event_type="orchestration.run.submit.accepted",
        occurred_at=_utc_iso(started_at),
        payload={"run_type": run_type},
    )
    return _extract_outbox_event_id(response, "seed", context)


def _run_happy_path(base_url: str, context: ScenarioContext) -> None:
    scenario = "happy_path"
    started_at = datetime(2026, 3, 1, 10, 0, 0, tzinfo=UTC)

    _seed_pending_run(base_url, context=context, started_at=started_at, run_type="DEFAULT")
    _publish_dapr_event(
        base_url,
        event_id="smoke-happy-started",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        event_type="orchestration.run.started",
        occurred_at=_utc_iso(started_at + timedelta(seconds=5)),
        payload={"worker_instance": "smoke-worker", "lease_token": "lease-smoke-happy"},
    )
    _publish_dapr_event(
        base_url,
        event_id="smoke-happy-succeeded",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        event_type="orchestration.run.succeeded",
        occurred_at=_utc_iso(started_at + timedelta(seconds=35)),
        payload={"result": "ok"},
    )

    run_payload = _get_run(base_url, context.run_id)
    run_data = run_payload.get("data") if isinstance(run_payload, dict) else None
    _assert(isinstance(run_data, dict), scenario, context, "run payload missing data object")
    _assert(
        run_data.get("status") == "SUCCEEDED",
        scenario,
        context,
        "run did not reach SUCCEEDED",
        run_status=run_data.get("status"),
    )

    _print_event(
        "scenario.result",
        scenario=scenario,
        status="PASS",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        service=context.service,
        final_status=run_data.get("status"),
    )


def _run_retry_path(base_url: str, compose_file: Path, runtime_dir: Path, context: ScenarioContext) -> None:
    scenario = "retry_path"
    started_at = datetime(2026, 3, 1, 10, 15, 0, tzinfo=UTC)
    outbox_id = _seed_pending_run(base_url, context=context, started_at=started_at)

    decision = _record_processing_failure(
        compose_file,
        runtime_dir,
        outbox_event_id=outbox_id,
        source_stream="mc:orchestration:events:orchestration_run_submit_accepted:v1:p0",
        source_message_id="smoke-retry-msg-1",
        error_code="WORKER_ERROR",
        error_message="simulated retry path timeout",
        failed_at=_utc_iso(started_at + timedelta(seconds=30)),
    )
    _assert(decision.get("decision") == "RETRY", scenario, context, "delivery hook did not schedule retry", decision=decision)
    _assert(decision.get("retry_attempt") == 2, scenario, context, "retry attempt is not 2", decision=decision)

    attempts_payload = _get_attempts(base_url, context.run_id)
    attempts = attempts_payload.get("data") if isinstance(attempts_payload, dict) else None
    _assert(isinstance(attempts, list) and len(attempts) > 0, scenario, context, "run attempts not available")
    first_attempt = attempts[0]
    _assert(isinstance(first_attempt, dict), scenario, context, "attempt row is not an object")
    _assert(first_attempt.get("retry_attempt") == 2, scenario, context, "attempt retry_attempt mismatch", attempt=first_attempt)
    _assert(first_attempt.get("status") == "PENDING", scenario, context, "attempt status should remain PENDING", attempt=first_attempt)

    metrics_payload = _get_metrics(base_url)
    metrics = metrics_payload.get("data") if isinstance(metrics_payload, dict) else None
    _assert(isinstance(metrics, dict), scenario, context, "metrics payload missing data")
    _assert(int(metrics.get("retries_total", 0)) >= 1, scenario, context, "metrics retries_total did not increment", metrics=metrics)

    _print_event(
        "scenario.result",
        scenario=scenario,
        status="PASS",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        service=context.service,
        retry_attempt=first_attempt.get("retry_attempt"),
        retries_total=metrics.get("retries_total"),
    )


def _run_dead_letter_path(base_url: str, compose_file: Path, runtime_dir: Path, context: ScenarioContext) -> None:
    scenario = "dead_letter_path"
    started_at = datetime(2026, 3, 1, 10, 30, 0, tzinfo=UTC)
    outbox_id = _seed_pending_run(base_url, context=context, started_at=started_at)

    decision: dict[str, Any] | None = None
    for attempt in range(1, 6):
        decision = _record_processing_failure(
            compose_file,
            runtime_dir,
            outbox_event_id=outbox_id,
            source_stream="mc:orchestration:events:orchestration_run_submit_accepted:v1:p0",
            source_message_id=f"smoke-dead-letter-msg-{attempt}",
            error_code="WORKER_ERROR",
            error_message=f"simulated fatal error attempt {attempt}",
            failed_at=_utc_iso(started_at + timedelta(seconds=30 + attempt)),
        )

    _assert(decision is not None and decision.get("decision") == "DEAD_LETTER", scenario, context, "delivery hook did not dead-letter event", decision=decision)

    attempts_payload = _get_attempts(base_url, context.run_id)
    attempts = attempts_payload.get("data") if isinstance(attempts_payload, dict) else None
    _assert(isinstance(attempts, list) and len(attempts) > 0, scenario, context, "run attempts not available")
    first_attempt = attempts[0]
    _assert(isinstance(first_attempt, dict), scenario, context, "attempt row is not an object")
    _assert(first_attempt.get("status") == "FAILED", scenario, context, "dead-lettered attempt status must be FAILED", attempt=first_attempt)
    _assert(first_attempt.get("dead_lettered_at") is not None, scenario, context, "dead_lettered_at missing", attempt=first_attempt)

    metrics_payload = _get_metrics(base_url)
    metrics = metrics_payload.get("data") if isinstance(metrics_payload, dict) else None
    _assert(isinstance(metrics, dict), scenario, context, "metrics payload missing data")
    _assert(int(metrics.get("dead_letter_total", 0)) >= 1, scenario, context, "metrics dead_letter_total did not increment", metrics=metrics)

    _print_event(
        "scenario.result",
        scenario=scenario,
        status="PASS",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        service=context.service,
        dead_letter_total=metrics.get("dead_letter_total"),
    )


def _run_watchdog_timeout_path(base_url: str, context: ScenarioContext) -> None:
    scenario = "watchdog_timeout_path"
    started_at = datetime(2026, 3, 1, 9, 45, 0, tzinfo=UTC)

    _seed_pending_run(base_url, context=context, started_at=started_at, run_type="BATCH")
    _publish_dapr_event(
        base_url,
        event_id="smoke-watchdog-started",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        event_type="orchestration.run.started",
        occurred_at=_utc_iso(started_at + timedelta(seconds=10)),
        payload={"worker_instance": "smoke-worker", "lease_token": "lease-smoke-watchdog"},
    )

    sweep_payload = _watchdog_sweep(base_url, evaluated_at=_utc_iso(started_at + timedelta(minutes=30)))
    sweep_data = sweep_payload.get("data") if isinstance(sweep_payload, dict) else None
    decisions = sweep_data.get("decisions") if isinstance(sweep_data, dict) else None
    _assert(isinstance(decisions, list) and len(decisions) > 0, scenario, context, "watchdog sweep returned no decisions")
    decision = decisions[0]
    _assert(isinstance(decision, dict), scenario, context, "watchdog decision is not object")
    _assert(decision.get("decision") == "ACCEPTED", scenario, context, "watchdog decision not accepted", decision=decision)
    _assert(decision.get("action") == "RETRY", scenario, context, "watchdog action should be RETRY for BATCH first violation", decision=decision)

    run_payload = _get_run(base_url, context.run_id)
    run_data = run_payload.get("data") if isinstance(run_payload, dict) else None
    _assert(isinstance(run_data, dict), scenario, context, "run payload missing data object")
    _assert(run_data.get("status") == "PENDING", scenario, context, "watchdog did not transition run to PENDING", run=run_data)
    _assert(run_data.get("watchdog_state") == "RETRY_SCHEDULED", scenario, context, "watchdog state mismatch", run=run_data)

    metrics_payload = _get_metrics(base_url)
    metrics = metrics_payload.get("data") if isinstance(metrics_payload, dict) else None
    _assert(isinstance(metrics, dict), scenario, context, "metrics payload missing data")
    _assert(int(metrics.get("watchdog_interventions", 0)) >= 1, scenario, context, "metrics watchdog_interventions did not increment", metrics=metrics)

    _print_event(
        "scenario.result",
        scenario=scenario,
        status="PASS",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        service=context.service,
        watchdog_action=decision.get("action"),
        watchdog_interventions=metrics.get("watchdog_interventions"),
    )


def _run_scenarios(base_url: str, compose_file: Path, runtime_dir: Path) -> tuple[int, int]:
    scenarios: list[tuple[str, ScenarioContext, Callable[[], None]]] = [
        (
            "happy_path",
            ScenarioContext(run_id="smoke-happy-run", correlation_id="smoke-happy-corr", service="api"),
            lambda: _run_happy_path(
                base_url,
                ScenarioContext(run_id="smoke-happy-run", correlation_id="smoke-happy-corr", service="api"),
            ),
        ),
        (
            "retry_path",
            ScenarioContext(run_id="smoke-retry-run", correlation_id="smoke-retry-corr", service="api"),
            lambda: _run_retry_path(
                base_url,
                compose_file,
                runtime_dir,
                ScenarioContext(run_id="smoke-retry-run", correlation_id="smoke-retry-corr", service="api"),
            ),
        ),
        (
            "dead_letter_path",
            ScenarioContext(run_id="smoke-dead-letter-run", correlation_id="smoke-dead-letter-corr", service="api"),
            lambda: _run_dead_letter_path(
                base_url,
                compose_file,
                runtime_dir,
                ScenarioContext(run_id="smoke-dead-letter-run", correlation_id="smoke-dead-letter-corr", service="api"),
            ),
        ),
        (
            "watchdog_timeout_path",
            ScenarioContext(run_id="smoke-watchdog-run", correlation_id="smoke-watchdog-corr", service="api"),
            lambda: _run_watchdog_timeout_path(
                base_url,
                ScenarioContext(run_id="smoke-watchdog-run", correlation_id="smoke-watchdog-corr", service="api"),
            ),
        ),
    ]

    failed = 0
    for scenario_name, scenario_context, scenario_runner in scenarios:
        _print_event("scenario.start", scenario=scenario_name, status="RUNNING")
        try:
            scenario_runner()
        except SmokeError as error:
            failed += 1
            _print_event(
                "scenario.result",
                scenario=error.scenario,
                status="FAIL",
                service=error.context.service,
                run_id=error.context.run_id,
                correlation_id=error.context.correlation_id,
                message=str(error),
                details=error.details,
            )
        except Exception as error:
            failed += 1
            _print_event(
                "scenario.result",
                scenario=scenario_name,
                status="FAIL",
                service=scenario_context.service,
                run_id=scenario_context.run_id,
                correlation_id=scenario_context.correlation_id,
                message=str(error),
            )

    return len(scenarios), failed


def main() -> int:
    parser = argparse.ArgumentParser(description="Mission Control orchestration smoke suite")
    parser.add_argument("--api-base", default="http://127.0.0.1:5000", help="API base URL")
    parser.add_argument(
        "--runtime-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to infra/dev",
    )
    parser.add_argument(
        "--skip-up",
        action="store_true",
        help="Do not call infra/dev/up.sh before executing scenarios",
    )
    args = parser.parse_args()

    runtime_dir = Path(args.runtime_dir).resolve()
    compose_file = runtime_dir / "docker-compose.yml"

    run_ids = [
        "smoke-happy-run",
        "smoke-retry-run",
        "smoke-dead-letter-run",
        "smoke-watchdog-run",
    ]
    correlations = [
        "smoke-happy-corr",
        "smoke-retry-corr",
        "smoke-dead-letter-corr",
        "smoke-watchdog-corr",
    ]

    try:
        if not args.skip_up:
            _print_event("suite.runtime", status="INFO", action="up", runtime_dir=str(runtime_dir))
            _run_command(["./up.sh"], cwd=runtime_dir)

        _cleanup_fixtures(
            compose_file,
            runtime_dir,
            run_ids=run_ids,
            correlations=correlations,
        )

        total, failed = _run_scenarios(args.api_base, compose_file, runtime_dir)
        if failed > 0:
            _print_event("suite.result", status="FAIL", scenarios_total=total, scenarios_failed=failed)
            return 1
        _print_event("suite.result", status="PASS", scenarios_total=total, scenarios_failed=0)
        return 0
    except Exception as error:
        _print_event(
            "suite.result",
            status="FAIL",
            scenarios_total=4,
            scenarios_failed=1,
            message=str(error),
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
