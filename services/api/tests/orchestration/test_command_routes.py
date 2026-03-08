import sqlite3

import aiosqlite
import pytest

from app.orchestration.domain.models import (
    CommandEnvelope,
    CommandStatus,
    OutboxEventEnvelope,
    OutboxStatus,
)
from app.orchestration.infrastructure.sqlite_repository import SqliteOrchestrationRepository


def _valid_body(*, schema_version: str = "1.0") -> dict:
    return {
        "command_type": "orchestration.run.submit",
        "schema_version": schema_version,
        "payload": {"run_id": "run-123", "input": {"story_key": "MC-370"}},
        "metadata": {
            "producer": "mc-cli",
            "correlation_id": "corr-123",
            "causation_id": None,
            "occurred_at": "2026-03-08T09:00:00Z",
        },
    }


def _count_rows(db_path: str, table: str) -> int:
    conn = sqlite3.connect(db_path)
    value = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return int(value)


@pytest.mark.parametrize("schema_version", ["1.0", "1.1"])
def test_submit_command_accepts_compatible_schema_versions(
    client,
    db_path,
    schema_version: str,
) -> None:
    response = client.post(
        "/v1/orchestration/commands",
        json=_valid_body(schema_version=schema_version),
    )
    assert response.status_code == 202

    data = response.json()["data"]
    assert data["status"] == "ACCEPTED"
    assert data["command"]["schema_version"] == schema_version
    assert data["outbox_event"]["schema_version"] == schema_version
    assert data["outbox_event"]["type"] == "orchestration.run.submit.accepted"

    assert _count_rows(db_path, "orchestration_commands") == 1
    assert _count_rows(db_path, "orchestration_outbox") == 1


def test_submit_command_rejects_unsupported_minor_version_with_details(client, db_path) -> None:
    response = client.post(
        "/v1/orchestration/commands",
        json=_valid_body(schema_version="1.2"),
    )
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "schema_version" for detail in error.get("details", []))
    assert _count_rows(db_path, "orchestration_commands") == 0
    assert _count_rows(db_path, "orchestration_outbox") == 0


def test_submit_command_rejects_invalid_taxonomy_with_details(client, db_path) -> None:
    body = _valid_body()
    body["command_type"] = "run.submit"

    response = client.post("/v1/orchestration/commands", json=body)
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "command_type" for detail in error.get("details", []))
    assert _count_rows(db_path, "orchestration_commands") == 0
    assert _count_rows(db_path, "orchestration_outbox") == 0


def test_submit_command_rejects_blank_metadata_with_details(client, db_path) -> None:
    body = _valid_body()
    body["metadata"]["producer"] = "   "

    response = client.post("/v1/orchestration/commands", json=body)
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "metadata.producer" for detail in error.get("details", []))
    assert _count_rows(db_path, "orchestration_commands") == 0
    assert _count_rows(db_path, "orchestration_outbox") == 0


@pytest.mark.asyncio
async def test_outbox_insert_failure_rolls_back_command_insert(db_path: str) -> None:
    async with aiosqlite.connect(db_path) as db:
        repo = SqliteOrchestrationRepository(db)

        command_one = CommandEnvelope(
            id="cmd-1",
            command_type="orchestration.run.submit",
            schema_version="1.0",
            occurred_at="2026-03-08T09:00:00Z",
            producer="mc-cli",
            correlation_id="corr-1",
            causation_id=None,
            payload={"run_id": "run-1"},
            status=CommandStatus.ACCEPTED,
            created_at="2026-03-08T09:00:00Z",
        )
        outbox_one = OutboxEventEnvelope(
            id="out-1",
            command_id="cmd-1",
            event_type="orchestration.run.submit.accepted",
            schema_version="1.0",
            occurred_at="2026-03-08T09:00:00Z",
            producer="mc-cli",
            correlation_id="corr-1",
            causation_id=None,
            payload={"accepted_command_id": "cmd-1"},
            status=OutboxStatus.PENDING,
            created_at="2026-03-08T09:00:00Z",
        )
        await repo.create_command_with_outbox(command=command_one, outbox_event=outbox_one)

        command_two = CommandEnvelope(
            id="cmd-2",
            command_type="orchestration.run.submit",
            schema_version="1.0",
            occurred_at="2026-03-08T09:01:00Z",
            producer="mc-cli",
            correlation_id="corr-2",
            causation_id=None,
            payload={"run_id": "run-2"},
            status=CommandStatus.ACCEPTED,
            created_at="2026-03-08T09:01:00Z",
        )
        outbox_two = OutboxEventEnvelope(
            id="out-1",
            command_id="cmd-2",
            event_type="orchestration.run.submit.accepted",
            schema_version="1.0",
            occurred_at="2026-03-08T09:01:00Z",
            producer="mc-cli",
            correlation_id="corr-2",
            causation_id=None,
            payload={"accepted_command_id": "cmd-2"},
            status=OutboxStatus.PENDING,
            created_at="2026-03-08T09:01:00Z",
        )

        with pytest.raises(sqlite3.IntegrityError):
            await repo.create_command_with_outbox(command=command_two, outbox_event=outbox_two)

    conn = sqlite3.connect(db_path)
    command_count = conn.execute("SELECT COUNT(*) FROM orchestration_commands").fetchone()[0]
    outbox_count = conn.execute("SELECT COUNT(*) FROM orchestration_outbox").fetchone()[0]
    command_two_count = conn.execute(
        "SELECT COUNT(*) FROM orchestration_commands WHERE id = 'cmd-2'"
    ).fetchone()[0]
    conn.close()

    assert command_count == 1
    assert outbox_count == 1
    assert command_two_count == 0
