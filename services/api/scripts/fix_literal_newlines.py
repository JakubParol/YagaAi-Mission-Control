#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import psycopg
from dotenv import load_dotenv
from psycopg import sql
from sqlalchemy.engine import make_url

API_ROOT = Path(__file__).resolve().parent.parent
for env_name in (".env.local", ".env"):
    load_dotenv(API_ROOT / env_name, override=False)


@dataclass(frozen=True)
class TargetColumn:
    table: str
    column: str
    id_column: str = "id"
    key_column: str | None = None
    label: str | None = None

    @property
    def name(self) -> str:
        return self.label or f"{self.table}.{self.column}"


TARGET_COLUMNS: tuple[TargetColumn, ...] = (
    TargetColumn("projects", "description", key_column="key"),
    TargetColumn("work_items", "summary", key_column="key"),
    TargetColumn("work_items", "description", key_column="key"),
    TargetColumn("work_items", "blocked_reason", key_column="key"),
    TargetColumn("backlogs", "goal"),
    TargetColumn("activity_log", "message", label="activity_log.message"),
    TargetColumn(
        "work_item_status_history",
        "note",
        label="work_item_status_history.note",
    ),
)

LITERAL_BACKSLASH_N = "\\n"
ACTUAL_NEWLINE = "\n"
SAMPLE_LIMIT = 5


@dataclass(frozen=True)
class ScanResult:
    target: TargetColumn
    count: int
    samples: tuple[str, ...]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Replace literal \\n sequences stored in planning text columns with actual newlines. "
            "Dry-run by default."
        )
    )
    parser.add_argument(
        "--dsn",
        help=(
            "Explicit PostgreSQL DSN. Defaults to MC_API_POSTGRES_DSN from env/.env.local/.env. "
            "Both postgresql:// and postgresql+psycopg:// are accepted."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the replacements. Without this flag the script only reports counts.",
    )
    parser.add_argument(
        "--include-activity-log",
        action="store_true",
        help=(
            "Also fix activity_log.message rows "
            "(off by default because audit logs are historical)."
        ),
    )
    return parser


def get_raw_dsn(explicit_dsn: str | None) -> str:
    if explicit_dsn:
        return explicit_dsn
    raw_dsn = os.environ.get("MC_API_POSTGRES_DSN", "").strip()
    if not raw_dsn:
        msg = "MC_API_POSTGRES_DSN is not set. Pass --dsn or export the env var."
        raise SystemExit(msg)
    return raw_dsn


def to_sync_dsn(raw_dsn: str) -> str:
    url = make_url(raw_dsn)
    if url.drivername == "postgresql+psycopg":
        url = url.set(drivername="postgresql")
    return url.render_as_string(hide_password=False)


def active_targets(include_activity_log: bool) -> tuple[TargetColumn, ...]:
    if include_activity_log:
        return TARGET_COLUMNS
    return tuple(target for target in TARGET_COLUMNS if target.table != "activity_log")


def fetch_count(cur: psycopg.Cursor[tuple], target: TargetColumn) -> int:
    query = sql.SQL("SELECT count(*) FROM {} WHERE position(%s in {}) > 0").format(
        sql.Identifier(target.table),
        sql.Identifier(target.column),
    )
    cur.execute(query, [LITERAL_BACKSLASH_N])
    row = cur.fetchone()
    return int(row[0] if row else 0)


def fetch_samples(cur: psycopg.Cursor[tuple], target: TargetColumn) -> tuple[str, ...]:
    select_parts: list[sql.Composable] = [
        sql.SQL("SELECT {}::text").format(sql.Identifier(target.id_column))
    ]
    if target.key_column:
        key_select = sql.SQL(", {}::text").format(sql.Identifier(target.key_column))
        select_parts.append(key_select)
    sample_sql = sql.SQL(
        ", left(replace({}, %s, %s), 120) "
        "FROM {} WHERE position(%s in {}) > 0 "
        "ORDER BY {} LIMIT {}"
    )
    select_parts.append(
        sample_sql.format(
            sql.Identifier(target.column),
            sql.Identifier(target.table),
            sql.Identifier(target.column),
            sql.Identifier(target.id_column),
            sql.Literal(SAMPLE_LIMIT),
        )
    )
    query = sql.Composed(select_parts)
    cur.execute(query, [LITERAL_BACKSLASH_N, "↩", LITERAL_BACKSLASH_N])
    rows = cur.fetchall()
    samples: list[str] = []
    for row in rows:
        if target.key_column:
            row_id, row_key, preview = row
            samples.append(f"{row_key} ({row_id}): {preview}")
        else:
            row_id, preview = row
            samples.append(f"{row_id}: {preview}")
    return tuple(samples)


def scan(conn: psycopg.Connection, targets: Sequence[TargetColumn]) -> list[ScanResult]:
    results: list[ScanResult] = []
    with conn.cursor() as cur:
        for target in targets:
            count = fetch_count(cur, target)
            samples = fetch_samples(cur, target) if count else ()
            results.append(ScanResult(target=target, count=count, samples=samples))
    return results


def print_scan(results: Sequence[ScanResult]) -> None:
    total = 0
    print("Literal \\n scan results:")
    for result in results:
        total += result.count
        print(f"- {result.target.name}: {result.count}")
        for sample in result.samples:
            print(f"    • {sample}")
    print(f"Total affected rows across selected columns: {total}")


def apply(conn: psycopg.Connection, results: Sequence[ScanResult]) -> list[tuple[str, int]]:
    updates: list[tuple[str, int]] = []
    with conn.cursor() as cur:
        for result in results:
            if result.count == 0:
                continue
            target = result.target
            query = sql.SQL(
                "UPDATE {} SET {} = replace({}, %s, %s) WHERE position(%s in {}) > 0"
            ).format(
                sql.Identifier(target.table),
                sql.Identifier(target.column),
                sql.Identifier(target.column),
                sql.Identifier(target.column),
            )
            cur.execute(query, [LITERAL_BACKSLASH_N, ACTUAL_NEWLINE, LITERAL_BACKSLASH_N])
            updates.append((target.name, cur.rowcount))
    conn.commit()
    return updates


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    raw_dsn = get_raw_dsn(args.dsn)
    dsn = to_sync_dsn(raw_dsn)
    targets = active_targets(include_activity_log=args.include_activity_log)

    with psycopg.connect(dsn) as conn:
        results = scan(conn, targets)
        print_scan(results)

        if not args.apply:
            print()
            print("Dry run only. Re-run with --apply to perform the replacement.")
            print(
                "Note: metadata_json/event_data_json are intentionally excluded "
                "so we do not mutate structured JSON payloads."
            )
            return 0

        print()
        updates = apply(conn, results)
        if not updates:
            print("No rows updated.")
            return 0

        print("Applied updates:")
        for target_name, rowcount in updates:
            print(f"- {target_name}: {rowcount}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
