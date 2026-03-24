"""Add main_session_key to agents table.

Stores the OpenClaw main session key for each agent, used as the
dispatch target when the Control Plane sends work to an agent.
Unique partial index ensures no two agents share the same session key.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260323_010"
down_revision = "20260323_009"
branch_labels = None
depends_on = None

TABLE = "agents"
COLUMN = "main_session_key"
INDEX = "idx_agents_main_session_key_unique"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns(TABLE)}
    if COLUMN not in existing_cols:
        conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {COLUMN} TEXT"))

    existing_indexes = {idx["name"] for idx in inspector.get_indexes(TABLE)}
    if INDEX not in existing_indexes:
        conn.execute(
            text(f"""
            CREATE UNIQUE INDEX {INDEX}
                ON {TABLE} ({COLUMN})
                WHERE {COLUMN} IS NOT NULL
            """)
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"DROP INDEX IF EXISTS {INDEX}"))
    conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN IF EXISTS {COLUMN}"))
