"""Rename orchestration tables/indexes to control_plane.

On existing databases: renames old tables/indexes.
On fresh databases: baseline already creates correct names, so this is a no-op.
"""

from alembic import op

revision = "20260317_002"
down_revision = "20260314_001"
branch_labels = None
depends_on = None

_TABLE_RENAMES = [
    ("orchestration_commands", "control_plane_commands"),
    ("orchestration_outbox", "control_plane_outbox"),
    ("orchestration_consumer_offsets", "control_plane_consumer_offsets"),
    ("orchestration_processed_messages", "control_plane_processed_messages"),
    ("orchestration_runs", "control_plane_runs"),
    ("orchestration_run_steps", "control_plane_run_steps"),
    ("orchestration_run_timeline", "control_plane_run_timeline"),
]

_INDEX_RENAMES = [
    ("idx_orchestration_commands_created_at", "idx_control_plane_commands_created_at"),
    ("idx_orchestration_outbox_status_available_at", "idx_control_plane_outbox_status_available_at"),
    ("idx_orchestration_outbox_command_id", "idx_control_plane_outbox_command_id"),
    (
        "idx_orchestration_processed_messages_correlation",
        "idx_control_plane_processed_messages_correlation",
    ),
    ("idx_orchestration_runs_status_updated_at", "idx_control_plane_runs_status_updated_at"),
    ("idx_orchestration_run_steps_run_status", "idx_control_plane_run_steps_run_status"),
]


def upgrade() -> None:
    for old_name, new_name in _TABLE_RENAMES:
        op.execute(
            f"ALTER TABLE IF EXISTS \"{old_name}\" RENAME TO \"{new_name}\""
        )
    for old_name, new_name in _INDEX_RENAMES:
        op.execute(f'ALTER INDEX IF EXISTS "{old_name}" RENAME TO "{new_name}"')


def downgrade() -> None:
    for old_name, new_name in reversed(_INDEX_RENAMES):
        op.execute(f'ALTER INDEX IF EXISTS "{new_name}" RENAME TO "{old_name}"')
    for old_name, new_name in reversed(_TABLE_RENAMES):
        op.execute(
            f"ALTER TABLE IF EXISTS \"{new_name}\" RENAME TO \"{old_name}\""
        )
