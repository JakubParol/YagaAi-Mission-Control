"""Baseline PostgreSQL schema."""

from alembic import op
from app.observability.infrastructure import tables as observability_tables
from app.control_plane.infrastructure import tables as control_plane_tables
from app.planning.infrastructure import tables as planning_tables
from app.shared.db.metadata import metadata

revision = "20260314_001"
down_revision = None
branch_labels = None
depends_on = None
_TABLE_MODULES = (planning_tables, observability_tables, control_plane_tables)


def upgrade() -> None:
    metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    metadata.drop_all(bind=op.get_bind())
