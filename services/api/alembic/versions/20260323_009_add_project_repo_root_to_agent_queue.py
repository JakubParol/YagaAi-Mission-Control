"""Add project_repo_root column to control_plane_agent_queue.

Stores the project repo_root at enqueue time, populated from
Planning project data so dispatch can set the correct working
directory without config-level hardcoded paths.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_009"
down_revision = "20260323_008"
branch_labels = None
depends_on = None

TABLE = "control_plane_agent_queue"
COLUMN = "project_repo_root"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns(TABLE)}
    if COLUMN not in existing_cols:
        conn.execute(
            text(f"ALTER TABLE {TABLE} ADD COLUMN {COLUMN} TEXT NOT NULL DEFAULT ''")
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN IF EXISTS {COLUMN}"))
