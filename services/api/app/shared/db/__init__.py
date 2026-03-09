from app.shared.db.migrations import migrate_sqlite_or_raise
from app.shared.db.postgres_migrations import migrate_postgres_or_raise

__all__ = ["migrate_sqlite_or_raise", "migrate_postgres_or_raise"]
