import pytest
from sqlalchemy.exc import IntegrityError

from app.control_plane.domain.models import (
    CommandEnvelope,
    CommandStatus,
    OutboxEventEnvelope,
    OutboxStatus,
)
from app.control_plane.infrastructure.repositories.command import DbCommandRepository
from app.shared.db.session import get_session_factory
from tests.support.postgres_compat import pg_connect


def _valid_body(*, schema_version: str = "1.0") -> dict:
    return {
        "command_type": "control-plane.run.submit",
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
    with pg_connect(db_path) as conn:
        row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()  # type: ignore[arg-type]
    assert row is not None
    return int(row[0])


@pytest.mark.parametrize("schema_version", ["1.0", "1.1"])
def test_submit_command_accepts_compatible_schema_versions(
    client,
    db_path,
    schema_version: str,
) -> None:
    response = client.post(
        "/v1/control-plane/commands",
        json=_valid_body(schema_version=schema_version),
    )
    assert response.status_code == 202

    data = response.json()["data"]
    assert data["status"] == "ACCEPTED"
    assert data["command"]["schema_version"] == schema_version
    assert data["outbox_event"]["schema_version"] == schema_version
    assert data["outbox_event"]["type"] == "control-plane.run.submit.accepted"
    delivery = data["outbox_event"]["payload"]["delivery"]
    assert delivery["attempt"] == 1
    assert delivery["max_attempts"] == 5
    assert delivery["backoff_seconds"] == 5
    assert delivery["next_retry_at"] == "2026-03-08T09:00:00Z"

    assert _count_rows(db_path, "control_plane_commands") == 1
    assert _count_rows(db_path, "control_plane_outbox") == 1


def test_submit_command_rejects_unsupported_minor_version_with_details(client, db_path) -> None:
    response = client.post(
        "/v1/control-plane/commands",
        json=_valid_body(schema_version="1.2"),
    )
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "schema_version" for detail in error.get("details", []))
    assert _count_rows(db_path, "control_plane_commands") == 0
    assert _count_rows(db_path, "control_plane_outbox") == 0


def test_submit_command_rejects_invalid_taxonomy_with_details(client, db_path) -> None:
    body = _valid_body()
    body["command_type"] = "run.submit"

    response = client.post("/v1/control-plane/commands", json=body)
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "command_type" for detail in error.get("details", []))
    assert _count_rows(db_path, "control_plane_commands") == 0
    assert _count_rows(db_path, "control_plane_outbox") == 0


def test_submit_command_rejects_blank_metadata_with_details(client, db_path) -> None:
    body = _valid_body()
    body["metadata"]["producer"] = "   "

    response = client.post("/v1/control-plane/commands", json=body)
    assert response.status_code == 400

    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail.get("field") == "metadata.producer" for detail in error.get("details", []))
    assert _count_rows(db_path, "control_plane_commands") == 0
    assert _count_rows(db_path, "control_plane_outbox") == 0


def test_submit_command_returns_503_when_capability_disabled(client, monkeypatch, db_path) -> None:
    monkeypatch.setattr(
        "app.control_plane.api.router.settings.control_plane_commands_enabled", False
    )

    response = client.post("/v1/control-plane/commands", json=_valid_body())
    assert response.status_code == 503
    assert response.json()["detail"] == "Control-plane capability disabled: control-plane.commands"
    assert _count_rows(db_path, "control_plane_commands") == 0
    assert _count_rows(db_path, "control_plane_outbox") == 0


@pytest.mark.asyncio
async def test_outbox_insert_failure_rolls_back_command_insert(db_path: str) -> None:
    async with get_session_factory()() as session:
        repo = DbCommandRepository(session)

        command_one = CommandEnvelope(
            id="cmd-1",
            command_type="control-plane.run.submit",
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
            event_type="control-plane.run.submit.accepted",
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
            command_type="control-plane.run.submit",
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
            event_type="control-plane.run.submit.accepted",
            schema_version="1.0",
            occurred_at="2026-03-08T09:01:00Z",
            producer="mc-cli",
            correlation_id="corr-2",
            causation_id=None,
            payload={"accepted_command_id": "cmd-2"},
            status=OutboxStatus.PENDING,
            created_at="2026-03-08T09:01:00Z",
        )

        with pytest.raises(IntegrityError):
            await repo.create_command_with_outbox(command=command_two, outbox_event=outbox_two)

    with pg_connect(db_path) as conn:
        cmd_row = conn.execute("SELECT COUNT(*) FROM control_plane_commands").fetchone()
        out_row = conn.execute("SELECT COUNT(*) FROM control_plane_outbox").fetchone()
        cmd2_row = conn.execute(
            "SELECT COUNT(*) FROM control_plane_commands WHERE id = 'cmd-2'"
        ).fetchone()

    assert cmd_row is not None and cmd_row[0] == 1
    assert out_row is not None and out_row[0] == 1
    assert cmd2_row is not None and cmd2_row[0] == 0
