#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import dataclass

import psycopg


@dataclass
class ParityReport:
    sqlite_tables: list[str]
    postgres_tables: list[str]
    missing_tables_in_postgres: list[str]
    extra_tables_in_postgres: list[str]
    sqlite_indexes: list[str]
    postgres_indexes: list[str]
    missing_indexes_in_postgres: list[str]
    extra_indexes_in_postgres: list[str]
    missing_columns_in_postgres: dict[str, list[str]]
    extra_columns_in_postgres: dict[str, list[str]]

    def has_mismatch(self) -> bool:
        return any(
            [
                self.missing_tables_in_postgres,
                self.extra_tables_in_postgres,
                self.missing_indexes_in_postgres,
                self.missing_columns_in_postgres,
            ]
        )


def _sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    return [str(r[0]) for r in rows]


def _sqlite_indexes(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND name LIKE 'idx_%'
        ORDER BY name
        """
    ).fetchall()
    return [str(r[0]) for r in rows]


def _sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


def _pg_tables(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        )
        return [str(r[0]) for r in cur.fetchall()]


def _pg_indexes(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
            ORDER BY indexname
            """
        )
        return [str(r[0]) for r in cur.fetchall()]


def _pg_columns(conn: psycopg.Connection, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table,),
        )
        return [str(r[0]) for r in cur.fetchall()]


def build_report(sqlite_path: str, postgres_dsn: str) -> ParityReport:
    with sqlite3.connect(sqlite_path) as sqlite_conn, psycopg.connect(postgres_dsn) as pg_conn:
        s_tables = _sqlite_tables(sqlite_conn)
        p_tables = _pg_tables(pg_conn)

        s_indexes = _sqlite_indexes(sqlite_conn)
        p_indexes = _pg_indexes(pg_conn)

        missing_tables = sorted(set(s_tables) - set(p_tables))
        extra_tables = sorted(set(p_tables) - set(s_tables))

        missing_indexes = sorted(set(s_indexes) - set(p_indexes))
        extra_indexes = sorted(set(p_indexes) - set(s_indexes))

        missing_columns: dict[str, list[str]] = {}
        extra_columns: dict[str, list[str]] = {}

        for table in sorted(set(s_tables) & set(p_tables)):
            s_cols = _sqlite_columns(sqlite_conn, table)
            p_cols = _pg_columns(pg_conn, table)

            miss = sorted(set(s_cols) - set(p_cols))
            extra = sorted(set(p_cols) - set(s_cols))

            if miss:
                missing_columns[table] = miss
            if extra:
                extra_columns[table] = extra

        return ParityReport(
            sqlite_tables=s_tables,
            postgres_tables=p_tables,
            missing_tables_in_postgres=missing_tables,
            extra_tables_in_postgres=extra_tables,
            sqlite_indexes=s_indexes,
            postgres_indexes=p_indexes,
            missing_indexes_in_postgres=missing_indexes,
            extra_indexes_in_postgres=extra_indexes,
            missing_columns_in_postgres=missing_columns,
            extra_columns_in_postgres=extra_columns,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare SQLite schema surface with PostgreSQL schema.")
    parser.add_argument(
        "--sqlite-path",
        default=os.environ.get("MC_DB_PATH", "/home/kuba/mission-control/data/mission-control.db"),
    )
    parser.add_argument(
        "--postgres-dsn",
        default=os.environ.get(
            "MC_API_POSTGRES_DSN",
            os.environ.get("MC_POSTGRES_DSN", "postgresql://mission_control:mission_control_dev@127.0.0.1:5432/mission_control"),
        ),
    )
    parser.add_argument("--json", action="store_true", help="Print report as JSON")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when mismatch exists")

    args = parser.parse_args()

    report = build_report(args.sqlite_path, args.postgres_dsn)

    payload = {
        "sqlite_tables": len(report.sqlite_tables),
        "postgres_tables": len(report.postgres_tables),
        "sqlite_indexes": len(report.sqlite_indexes),
        "postgres_indexes": len(report.postgres_indexes),
        "missing_tables_in_postgres": report.missing_tables_in_postgres,
        "extra_tables_in_postgres": report.extra_tables_in_postgres,
        "missing_indexes_in_postgres": report.missing_indexes_in_postgres,
        "extra_indexes_in_postgres": report.extra_indexes_in_postgres,
        "missing_columns_in_postgres": report.missing_columns_in_postgres,
        "extra_columns_in_postgres": report.extra_columns_in_postgres,
        "status": "mismatch" if report.has_mismatch() else "ok",
    }

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(f"Status: {payload['status']}")
        print(f"Tables: sqlite={payload['sqlite_tables']} postgres={payload['postgres_tables']}")
        print(f"Indexes(idx_*): sqlite={payload['sqlite_indexes']} postgres={payload['postgres_indexes']}")
        if payload["missing_tables_in_postgres"]:
            print("Missing tables in Postgres:", ", ".join(payload["missing_tables_in_postgres"]))
        if payload["extra_tables_in_postgres"]:
            print("Extra tables in Postgres:", ", ".join(payload["extra_tables_in_postgres"]))
        if payload["missing_indexes_in_postgres"]:
            print("Missing indexes in Postgres:", ", ".join(payload["missing_indexes_in_postgres"]))
        if payload["missing_columns_in_postgres"]:
            print("Missing columns in Postgres:")
            for table, cols in payload["missing_columns_in_postgres"].items():
                print(f"  - {table}: {', '.join(cols)}")

    if args.strict and report.has_mismatch():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
