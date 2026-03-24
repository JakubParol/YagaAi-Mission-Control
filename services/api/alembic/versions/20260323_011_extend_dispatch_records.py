"""Extend dispatch_records with session dispatch and execution callback columns.

Adds dispatch_session_key (known at dispatch time) and execution
callback fields (filled later via agent.execution.spawned callback).
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_011"
down_revision = "20260323_010"
branch_labels = None
depends_on = None

TABLE = "control_plane_dispatch_records"
NEW_COLUMNS = [
    ("dispatch_session_key", "TEXT"),
    ("execution_session_key", "TEXT"),
    ("runtime", "TEXT"),
    ("harness", "TEXT"),
    ("execution_spawned_at", "TEXT"),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns(TABLE)}
    for col_name, col_type in NEW_COLUMNS:
        if col_name not in existing_cols:
            conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {col_name} {col_type}"))


def downgrade() -> None:
    conn = op.get_bind()
    for col_name, _ in NEW_COLUMNS:
        conn.execute(
            text(f"ALTER TABLE {TABLE} DROP COLUMN IF EXISTS {col_name}")
        )
