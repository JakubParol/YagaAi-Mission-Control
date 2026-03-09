#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
from collections.abc import Iterable
from dataclasses import asdict, dataclass

import psycopg
from psycopg import sql

BOOTSTRAP_VERSION = "20260309_pg_bootstrap_001"
BOOTSTRAP_DESC = "bootstrap PostgreSQL schema from sqlite baseline"

TABLE_ORDER = [
    "imports",
    "langfuse_daily_metrics",
    "langfuse_requests",
    "projects",
    "project_counters",
    "agents",
    "epics",
    "stories",
    "tasks",
    "backlogs",
    "backlog_stories",
    "backlog_tasks",
    "task_assignments",
    "labels",
    "story_labels",
    "task_labels",
    "comments",
    "attachments",
    "activity_log",
    "epic_status_history",
    "story_status_history",
    "task_status_history",
    "schema_migrations",
    "orchestration_commands",
    "orchestration_outbox",
    "orchestration_consumer_offsets",
    "orchestration_processed_messages",
    "orchestration_runs",
    "orchestration_run_steps",
    "orchestration_run_timeline",
]


@dataclass
class TableCount:
    table: str
    sqlite_count: int
    postgres_count: int


@dataclass
class MigrationReport:
    mode: str
    sqlite_path: str
    migrated_tables: list[str]
    table_counts: list[TableCount]
    mismatched_tables: list[str]


def _sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    return [str(r[0]) for r in rows]


def _pg_tables(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
            ORDER BY table_name
            """
        )
        return [str(r[0]) for r in cur.fetchall()]


def _ordered_tables(sqlite_tables: Iterable[str], pg_tables: Iterable[str]) -> list[str]:
    s_set = set(sqlite_tables)
    p_set = set(pg_tables)
    common = s_set & p_set

    ordered = [t for t in TABLE_ORDER if t in common]
    extras = sorted(common - set(ordered))
    return ordered + extras


def _count_sqlite(conn: sqlite3.Connection, table: str) -> int:
    row = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
    return int(row[0]) if row else 0


def _count_pg(conn: psycopg.Connection, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
        row = cur.fetchone()
    return int(row[0]) if row else 0


def _truncate_all(cur: psycopg.Cursor, tables: list[str]) -> None:
    if not tables:
        return
    query = sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
        sql.SQL(", ").join(sql.Identifier(t) for t in tables)
    )
    cur.execute(query)


def _copy_table_data(
    sqlite_conn: sqlite3.Connection,
    pg_cur: psycopg.Cursor,
    table: str,
    *,
    batch_size: int,
) -> None:
    src_cur = sqlite_conn.execute(f'SELECT * FROM "{table}"')
    col_names = [str(d[0]) for d in src_cur.description or []]
    if not col_names:
        return

    insert_stmt = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.Identifier(c) for c in col_names),
        sql.SQL(", ").join(sql.Placeholder() for _ in col_names),
    )

    while True:
        batch = src_cur.fetchmany(batch_size)
        if not batch:
            break
        pg_cur.executemany(insert_stmt, batch)


def _ensure_bootstrap_ledger(pg_cur: psycopg.Cursor) -> None:
    pg_cur.execute(
        """
        INSERT INTO schema_migrations(version, description)
        VALUES (%s, %s)
        ON CONFLICT (version) DO NOTHING
        """,
        (BOOTSTRAP_VERSION, BOOTSTRAP_DESC),
    )


def _fix_imports_sequence(pg_cur: psycopg.Cursor) -> None:
    pg_cur.execute(
        """
        SELECT setval(
          pg_get_serial_sequence('imports', 'id'),
          COALESCE((SELECT MAX(id) FROM imports), 1),
          (SELECT COUNT(*) > 0 FROM imports)
        )
        """
    )


def run_migration(
    *,
    sqlite_path: str,
    postgres_dsn: str,
    do_migrate: bool,
    batch_size: int,
    include_schema_migrations: bool,
) -> MigrationReport:
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row

    try:
        with psycopg.connect(postgres_dsn) as pg_conn:
            s_tables = _sqlite_tables(sqlite_conn)
            p_tables = _pg_tables(pg_conn)
            ordered_tables = _ordered_tables(s_tables, p_tables)

            if do_migrate:
                with pg_conn.cursor() as cur:
                    _truncate_all(cur, ordered_tables)
                    for table in ordered_tables:
                        _copy_table_data(sqlite_conn, cur, table, batch_size=batch_size)
                    _ensure_bootstrap_ledger(cur)
                    _fix_imports_sequence(cur)
                pg_conn.commit()

            counts: list[TableCount] = []
            mismatched: list[str] = []
            for table in ordered_tables:
                if not include_schema_migrations and table == "schema_migrations":
                    continue
                s_count = _count_sqlite(sqlite_conn, table)
                p_count = _count_pg(pg_conn, table)
                counts.append(TableCount(table=table, sqlite_count=s_count, postgres_count=p_count))
                if s_count != p_count:
                    mismatched.append(table)

            return MigrationReport(
                mode="migrate" if do_migrate else "dry-run",
                sqlite_path=sqlite_path,
                migrated_tables=ordered_tables,
                table_counts=counts,
                mismatched_tables=mismatched,
            )
    finally:
        sqlite_conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate data from SQLite to PostgreSQL.")
    parser.add_argument(
        "--sqlite-path",
        default=os.environ.get("MC_DB_PATH", "/home/kuba/mission-control/data/mission-control.db"),
    )
    parser.add_argument(
        "--postgres-dsn",
        default=os.environ.get(
            "MC_API_POSTGRES_DSN",
            os.environ.get(
                "MC_POSTGRES_DSN",
                "postgresql://mission_control:mission_control_dev@127.0.0.1:5432/mission_control",
            ),
        ),
    )
    parser.add_argument("--migrate", action="store_true", help="Execute truncation + data copy")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if row-count mismatch exists")
    parser.add_argument(
        "--include-schema-migrations",
        action="store_true",
        help="Include schema_migrations table in row-count parity checks",
    )

    args = parser.parse_args()

    report = run_migration(
        sqlite_path=args.sqlite_path,
        postgres_dsn=args.postgres_dsn,
        do_migrate=args.migrate,
        batch_size=args.batch_size,
        include_schema_migrations=args.include_schema_migrations,
    )

    payload = {
        "mode": report.mode,
        "sqlite_path": report.sqlite_path,
        "migrated_tables": report.migrated_tables,
        "table_counts": [asdict(t) for t in report.table_counts],
        "mismatched_tables": report.mismatched_tables,
        "status": "mismatch" if report.mismatched_tables else "ok",
    }

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(f"Mode: {report.mode}")
        print(f"SQLite path: {report.sqlite_path}")
        print(f"Tables processed: {len(report.migrated_tables)}")
        for item in report.table_counts:
            mark = "OK" if item.sqlite_count == item.postgres_count else "MISMATCH"
            print(f"- {item.table}: sqlite={item.sqlite_count} postgres={item.postgres_count} [{mark}]")
        print(f"Status: {payload['status']}")
        if report.mismatched_tables:
            print("Mismatched tables:", ", ".join(report.mismatched_tables))

    if args.strict and report.mismatched_tables:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
