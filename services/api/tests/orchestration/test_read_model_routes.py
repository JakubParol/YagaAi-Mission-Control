import sqlite3


def _seed_command(conn: sqlite3.Connection, *, command_id: str, correlation_id: str) -> None:
    conn.execute(
        """
        INSERT INTO orchestration_commands(
          id, command_type, schema_version, occurred_at, producer, correlation_id,
          causation_id, payload_json, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            command_id,
            "orchestration.run.submit",
            "1.0",
            "2026-03-08T10:00:00Z",
            "mc-cli",
            correlation_id,
            None,
            "{}",
            "ACCEPTED",
            "2026-03-08T10:00:00Z",
        ),
    )


def _seed_run(conn: sqlite3.Connection, *, run_id: str, status: str, correlation_id: str) -> None:
    conn.execute(
        """
        INSERT INTO orchestration_runs(
          run_id, status, correlation_id, current_step_id, last_event_type,
          created_at, updated_at, run_type, lease_owner, lease_token,
          last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            status,
            correlation_id,
            "step-1",
            "orchestration.run.started",
            "2026-03-08T10:00:00Z",
            "2026-03-08T10:10:00Z",
            "DEFAULT",
            "worker-a",
            "lease-1",
            "2026-03-08T10:09:00Z",
            "2026-03-08T10:40:00Z",
            1,
            "RETRY_SCHEDULED",
            None,
        ),
    )


def _seed_timeline_entry(
    conn: sqlite3.Connection,
    *,
    entry_id: str,
    run_id: str,
    event_type: str,
    decision: str,
    occurred_at: str,
    correlation_id: str,
    causation_id: str | None,
    payload_json: str,
) -> None:
    conn.execute(
        """
        INSERT INTO orchestration_run_timeline(
          id, run_id, step_id, message_id, event_type, decision, reason_code, reason_message,
          correlation_id, causation_id, payload_json, occurred_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry_id,
            run_id,
            "step-1",
            f"msg-{entry_id}",
            event_type,
            decision,
            None,
            None,
            correlation_id,
            causation_id,
            payload_json,
            occurred_at,
            occurred_at,
        ),
    )


def test_run_state_endpoints_include_identifier_contract(client, db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    _seed_run(conn, run_id="run-1", status="RUNNING", correlation_id="corr-1")
    _seed_timeline_entry(
        conn,
        entry_id="t-1",
        run_id="run-1",
        event_type="orchestration.run.started",
        decision="ACCEPTED",
        occurred_at="2026-03-08T10:09:00Z",
        correlation_id="corr-1",
        causation_id="cause-1",
        payload_json='{"step_id":"step-1"}',
    )
    conn.commit()
    conn.close()

    list_response = client.get("/v1/orchestration/runs", params={"status": "RUNNING"})
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["meta"] == {"total": 1, "limit": 20, "offset": 0}
    run = payload["data"][0]
    assert run["run_id"] == "run-1"
    assert run["status"] == "RUNNING"
    assert run["correlation_id"] == "corr-1"
    assert run["causation_id"] == "cause-1"

    get_response = client.get("/v1/orchestration/runs/run-1")
    assert get_response.status_code == 200
    single = get_response.json()["data"]
    assert single["run_id"] == "run-1"
    assert single["correlation_id"] == "corr-1"
    assert single["causation_id"] == "cause-1"


def test_timeline_endpoint_supports_filters_and_deterministic_pagination(
    client, db_path: str
) -> None:
    conn = sqlite3.connect(db_path)
    _seed_run(conn, run_id="run-1", status="RUNNING", correlation_id="corr-1")
    _seed_run(conn, run_id="run-2", status="FAILED", correlation_id="corr-2")

    _seed_timeline_entry(
        conn,
        entry_id="t-1",
        run_id="run-1",
        event_type="orchestration.run.started",
        decision="ACCEPTED",
        occurred_at="2026-03-08T10:00:00Z",
        correlation_id="corr-1",
        causation_id="cause-1",
        payload_json='{"step_id":"step-1"}',
    )
    _seed_timeline_entry(
        conn,
        entry_id="t-2",
        run_id="run-1",
        event_type="orchestration.watchdog.action",
        decision="ACCEPTED",
        occurred_at="2026-03-08T10:00:00Z",
        correlation_id="corr-1",
        causation_id="cause-2",
        payload_json='{"action":"RETRY"}',
    )
    _seed_timeline_entry(
        conn,
        entry_id="t-3",
        run_id="run-1",
        event_type="orchestration.step.started",
        decision="ACCEPTED",
        occurred_at="2026-03-08T10:01:00Z",
        correlation_id="corr-1",
        causation_id="cause-3",
        payload_json='{"step_id":"step-2"}',
    )
    _seed_timeline_entry(
        conn,
        entry_id="t-4",
        run_id="run-2",
        event_type="orchestration.run.failed",
        decision="ACCEPTED",
        occurred_at="2026-03-08T10:02:00Z",
        correlation_id="corr-2",
        causation_id="cause-4",
        payload_json="{}",
    )
    conn.commit()
    conn.close()

    page1 = client.get("/v1/orchestration/timeline", params={"limit": 2, "offset": 0})
    assert page1.status_code == 200
    page1_data = page1.json()["data"]
    assert [entry["id"] for entry in page1_data] == ["t-4", "t-3"]

    page2 = client.get("/v1/orchestration/timeline", params={"limit": 2, "offset": 2})
    assert page2.status_code == 200
    page2_data = page2.json()["data"]
    assert [entry["id"] for entry in page2_data] == ["t-2", "t-1"]

    filtered = client.get(
        "/v1/orchestration/timeline",
        params={
            "run_id": "run-1",
            "status": "RUNNING",
            "event_type": "orchestration.watchdog.action",
            "occurred_after": "2026-03-08T09:59:00Z",
            "occurred_before": "2026-03-08T10:00:30Z",
        },
    )
    assert filtered.status_code == 200
    data = filtered.json()
    assert data["meta"]["total"] == 1
    entry = data["data"][0]
    assert entry["id"] == "t-2"
    assert entry["is_watchdog_action"] is True
    assert entry["watchdog_action"] == "RETRY"
    assert entry["correlation_id"] == "corr-1"
    assert entry["causation_id"] == "cause-2"


def test_run_attempts_endpoint_returns_attempts_and_not_found(client, db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    _seed_run(conn, run_id="run-1", status="RUNNING", correlation_id="corr-1")
    _seed_command(conn, command_id="cmd-1", correlation_id="corr-1")
    conn.execute(
        """
        INSERT INTO orchestration_outbox(
          id, command_id, event_type, schema_version, occurred_at, producer, correlation_id,
          causation_id, payload_json, status, retry_attempt, max_attempts, available_at,
          published_at, last_error, dead_lettered_at, dead_letter_payload_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "out-1",
            "cmd-1",
            "orchestration.run.submit.accepted",
            "1.0",
            "2026-03-08T10:03:00Z",
            "mc-cli",
            "corr-1",
            "cause-1",
            '{"accepted_command_id":"cmd-1"}',
            "PENDING",
            2,
            5,
            "2026-03-08T10:04:00Z",
            None,
            "WORKER_ERROR: timeout",
            None,
            None,
            "2026-03-08T10:03:00Z",
        ),
    )
    conn.commit()
    conn.close()

    response = client.get("/v1/orchestration/runs/run-1/attempts")
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"] == {"total": 1, "limit": 20, "offset": 0}
    attempt = payload["data"][0]
    assert attempt["outbox_event_id"] == "out-1"
    assert attempt["retry_attempt"] == 2
    assert attempt["max_attempts"] == 5
    assert attempt["correlation_id"] == "corr-1"
    assert attempt["causation_id"] == "cause-1"

    not_found = client.get("/v1/orchestration/runs/run-missing/attempts")
    assert not_found.status_code == 404
    assert not_found.json()["error"]["code"] == "NOT_FOUND"


def test_orchestration_metrics_endpoint_returns_queue_and_latency_metrics(
    client, db_path: str
) -> None:
    conn = sqlite3.connect(db_path)
    _seed_command(conn, command_id="cmd-metrics-1", correlation_id="corr-metrics-1")
    _seed_command(conn, command_id="cmd-metrics-2", correlation_id="corr-metrics-2")
    conn.execute(
        """
        INSERT INTO orchestration_runs(
          run_id, status, correlation_id, current_step_id, last_event_type,
          created_at, updated_at, run_type, lease_owner, lease_token,
          last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "run-metrics-1",
            "SUCCEEDED",
            "corr-metrics-1",
            None,
            "orchestration.run.succeeded",
            "2026-03-08T10:00:00Z",
            "2026-03-08T10:00:03Z",
            "DEFAULT",
            None,
            None,
            None,
            None,
            0,
            "NONE",
            "2026-03-08T10:00:03Z",
        ),
    )
    conn.execute(
        """
        INSERT INTO orchestration_runs(
          run_id, status, correlation_id, current_step_id, last_event_type,
          created_at, updated_at, run_type, lease_owner, lease_token,
          last_heartbeat_at, watchdog_timeout_at, watchdog_attempt, watchdog_state, terminal_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "run-metrics-2",
            "FAILED",
            "corr-metrics-2",
            None,
            "orchestration.run.failed",
            "2026-03-08T10:00:00Z",
            "2026-03-08T10:00:08Z",
            "DEFAULT",
            None,
            None,
            None,
            None,
            0,
            "FAILED_BY_WATCHDOG",
            "2026-03-08T10:00:08Z",
        ),
    )
    conn.execute(
        """
        INSERT INTO orchestration_outbox(
          id, command_id, event_type, schema_version, occurred_at, producer, correlation_id,
          causation_id, payload_json, status, retry_attempt, max_attempts, available_at,
          published_at, last_error, dead_lettered_at, dead_letter_payload_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "out-metrics-1",
            "cmd-metrics-1",
            "orchestration.run.submit.accepted",
            "1.0",
            "2026-03-08T10:00:00Z",
            "mc-cli",
            "corr-metrics-1",
            None,
            '{"run_id":"run-metrics-1"}',
            "PENDING",
            2,
            5,
            "2026-03-08T10:00:00Z",
            None,
            "WORKER_ERROR: timeout",
            None,
            None,
            "2026-03-08T10:00:00Z",
        ),
    )
    conn.execute(
        """
        INSERT INTO orchestration_outbox(
          id, command_id, event_type, schema_version, occurred_at, producer, correlation_id,
          causation_id, payload_json, status, retry_attempt, max_attempts, available_at,
          published_at, last_error, dead_lettered_at, dead_letter_payload_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "out-metrics-2",
            "cmd-metrics-2",
            "orchestration.run.submit.accepted",
            "1.0",
            "2026-03-08T10:00:00Z",
            "mc-cli",
            "corr-metrics-2",
            None,
            '{"run_id":"run-metrics-2"}',
            "FAILED",
            5,
            5,
            "2026-03-08T10:00:00Z",
            None,
            "WORKER_ERROR: poison payload",
            "2026-03-08T10:01:00Z",
            '{"dead_letter_reason":"MAX_ATTEMPTS_EXCEEDED"}',
            "2026-03-08T10:00:00Z",
        ),
    )
    conn.execute(
        """
        INSERT INTO orchestration_run_timeline(
          id, run_id, step_id, message_id, event_type, decision, reason_code, reason_message,
          correlation_id, causation_id, payload_json, occurred_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "timeline-metrics-1",
            "run-metrics-2",
            None,
            "msg-metrics-1",
            "orchestration.watchdog.action",
            "ACCEPTED",
            "RUN_TIMEOUT",
            "Watchdog applied FAIL",
            "corr-metrics-2",
            None,
            '{"action":"FAIL"}',
            "2026-03-08T10:01:00Z",
            "2026-03-08T10:01:00Z",
        ),
    )
    conn.commit()
    conn.close()

    response = client.get("/v1/orchestration/metrics")
    assert response.status_code == 200

    payload = response.json()["data"]
    assert payload["queue_pending"] == 1
    assert payload["retries_total"] == 2
    assert payload["dead_letter_total"] == 1
    assert payload["watchdog_interventions"] == 1
    assert payload["run_latency_avg_ms"] is not None
    assert payload["run_latency_p95_ms"] is not None
    assert payload["generated_at"]
