from __future__ import annotations

from pathlib import Path
from typing import cast

import psycopg
from psycopg.abc import QueryNoTemplate

_BOOTSTRAP_VERSION = "20260309_pg_bootstrap_001"


def _schema_path() -> Path:
    return Path(__file__).resolve().with_name("postgres_schema.sql")


def migrate_postgres_or_raise(dsn: str) -> None:
    if not dsn:
        msg = "MC_API_POSTGRES_DSN must be set for PostgreSQL migrations"
        raise RuntimeError(msg)

    schema_file = _schema_path()
    if not schema_file.exists():
        msg = f"PostgreSQL schema file not found: {schema_file}"
        raise RuntimeError(msg)

    schema_sql = schema_file.read_text(encoding="utf-8")

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(cast(QueryNoTemplate, schema_sql))
                cur.execute(
                    """
                    INSERT INTO schema_migrations(version, description)
                    VALUES (%s, %s)
                    ON CONFLICT (version) DO NOTHING
                    """,
                    (_BOOTSTRAP_VERSION, "bootstrap PostgreSQL schema from sqlite baseline"),
                )
            conn.commit()
    except psycopg.Error as exc:
        raise RuntimeError(f"PostgreSQL migration failed: {exc}") from exc
