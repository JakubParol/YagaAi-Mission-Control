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
from typing import Any


@dataclass(frozen=True)
class ScenarioContext:
    run_id: str
    correlation_id: str
    service: str


class SmokeError(RuntimeError):
    def __init__(self, scenario: str, context: ScenarioContext, message: str, details: dict[str, Any] | None = None) -> None:
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


def _assert(condition: bool, scenario: str, context: ScenarioContext, message: str, **details: Any) -> None:
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


def _cleanup_fixtures(compose_file: Path, runtime_dir: Path, *, run_ids: list[str], correlations: list[str]) -> None:
    cleanup_py = f"""
import sqlite3

run_ids = {json.dumps(run_ids)}
correlations = {json.dumps(correlations)}
conn = sqlite3.connect('/runtime/sqlite/mission-control.db')
try:
    conn.execute('PRAGMA foreign_keys = ON')
    for run_id in run_ids:
        conn.execute('DELETE FROM orchestration_run_steps WHERE run_id = ?', (run_id,))
        conn.execute('DELETE FROM orchestration_run_timeline WHERE run_id = ?', (run_id,))
        conn.execute('DELETE FROM orchestration_runs WHERE run_id = ?', (run_id,))
    for correlation_id in correlations:
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
            "python",
            "-",
        ],
        cwd=runtime_dir,
        input_text=cleanup_py,
    )


def _run_happy_path(base_url: str) -> None:
    scenario = "happy_path"
    context = ScenarioContext(
        run_id="smoke-happy-run",
        correlation_id="smoke-happy-corr",
        service="api",
    )
    started_at = datetime(2026, 3, 1, 10, 0, 0, tzinfo=UTC)

    _create_command(
        base_url,
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        occurred_at=_utc_iso(started_at),
    )
    _publish_dapr_event(
        base_url,
        event_id="smoke-happy-accepted",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        event_type="orchestration.run.submit.accepted",
        occurred_at=_utc_iso(started_at),
        payload={"run_type": "DEFAULT"},
    )
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
    _assert(run_data.get("status") == "SUCCEEDED", scenario, context, "run did not reach SUCCEEDED", run_status=run_data.get("status"))
    _assert(run_data.get("correlation_id") == context.correlation_id, scenario, context, "correlation id mismatch", run_correlation_id=run_data.get("correlation_id"))

    _print_event(
        "scenario.result",
        scenario=scenario,
        status="PASS",
        run_id=context.run_id,
        correlation_id=context.correlation_id,
        service=context.service,
        final_status=run_data.get("status"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Mission Control orchestration smoke suite")
    parser.add_argument("--api-base", default="http://127.0.0.1:5001", help="API base URL")
    parser.add_argument(
        "--runtime-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to infra/local-runtime",
    )
    parser.add_argument(
        "--skip-up",
        action="store_true",
        help="Do not call infra/local-runtime/up.sh before executing scenarios",
    )
    args = parser.parse_args()

    runtime_dir = Path(args.runtime_dir).resolve()
    compose_file = runtime_dir / "docker-compose.yml"

    try:
        if not args.skip_up:
            _print_event("suite.runtime", status="INFO", action="up", runtime_dir=str(runtime_dir))
            _run_command(["./up.sh"], cwd=runtime_dir)

        _cleanup_fixtures(
            compose_file,
            runtime_dir,
            run_ids=["smoke-happy-run"],
            correlations=["smoke-happy-corr"],
        )

        _print_event("scenario.start", scenario="happy_path", status="RUNNING")
        _run_happy_path(args.api_base)
        _print_event("suite.result", status="PASS", scenarios_total=1, scenarios_failed=0)
        return 0
    except SmokeError as error:
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
        _print_event("suite.result", status="FAIL", scenarios_total=1, scenarios_failed=1)
        return 1
    except Exception as error:  # noqa: BLE001
        _print_event(
            "suite.result",
            status="FAIL",
            scenarios_total=1,
            scenarios_failed=1,
            message=str(error),
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
