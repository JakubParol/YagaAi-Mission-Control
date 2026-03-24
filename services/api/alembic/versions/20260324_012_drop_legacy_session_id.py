"""Drop legacy session_id column from control_plane_dispatch_records.

dispatch_session_key is the single source of truth for the dispatch
target session. The old session_id column was a duplicate from the
HTTP adapter era.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "20260324_012"
down_revision = "20260323_011"
branch_labels = None
depends_on = None

TABLE = "control_plane_dispatch_records"
COLUMN = "session_id"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if TABLE not in inspector.get_table_names():
        return

    existing_cols = {col["name"] for col in inspector.get_columns(TABLE)}
    if COLUMN in existing_cols:
        conn.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN {COLUMN}"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS {COLUMN} TEXT"))
