import sqlite3


def test_watchdog_sweep_endpoint_returns_decisions(client, db_path: str) -> None:
    conn = sqlite3.connect(db_path)
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
            "run-watchdog-route-1",
            "RUNNING",
            "corr-route-1",
            None,
            "orchestration.run.started",
            "2026-03-08T12:00:00Z",
            "2026-03-08T12:00:00Z",
            "DEFAULT",
            "worker-a",
            "lease-route-1",
            "2026-03-08T12:00:00Z",
            "2026-03-08T12:01:00Z",
            0,
            "NONE",
            None,
        ),
    )
    conn.commit()
    conn.close()

    response = client.post(
        "/v1/orchestration/watchdog/sweep",
        json={
            "watchdog_instance": "watchdog-route",
            "evaluated_at": "2026-03-08T12:05:00Z",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "OK"
    assert data["decisions"]
    assert data["decisions"][0]["run_id"] == "run-watchdog-route-1"
