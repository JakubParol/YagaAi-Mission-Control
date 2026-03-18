"""Data transformation: stories/tasks/epics -> work_items.

Called from the Alembic migration. Reads old data, transforms, writes
into new tables. Verifies counts after migration.
"""

import logging
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from app.shared.lexorank import rank_batch

logger = logging.getLogger(__name__)


def _safe_read(conn: Connection, table_name: str) -> list:
    """Read all rows from a table, returning [] if the table doesn't exist."""
    inspector = inspect(conn)
    if table_name not in inspector.get_table_names():
        logger.info("Table %s does not exist, skipping", table_name)
        return []
    return list(conn.execute(text(f"SELECT * FROM {table_name}")).mappings().all())


def _safe_read_ordered(conn: Connection, table_name: str, order: str) -> list:
    """Read all rows ordered, returning [] if the table doesn't exist."""
    inspector = inspect(conn)
    if table_name not in inspector.get_table_names():
        logger.info("Table %s does not exist, skipping", table_name)
        return []
    return list(conn.execute(text(f"SELECT * FROM {table_name} ORDER BY {order}")).mappings().all())


def _read_old_data(conn: Connection) -> dict[str, Any]:
    """Read all v1 data into a dict for migration."""
    data: dict[str, Any] = {
        "epics": _safe_read(conn, "epics"),
        "stories": _safe_read(conn, "stories"),
        "tasks": _safe_read(conn, "tasks"),
        "bs": _safe_read_ordered(conn, "backlog_stories", "backlog_id, position"),
        "bt": _safe_read_ordered(conn, "backlog_tasks", "backlog_id, position"),
        "story_labels": _safe_read(conn, "story_labels"),
        "task_labels": _safe_read(conn, "task_labels"),
        "task_assignments": _safe_read(conn, "task_assignments"),
        "epic_hist": _safe_read(conn, "epic_status_history"),
        "story_hist": _safe_read(conn, "story_status_history"),
        "task_hist": _safe_read(conn, "task_status_history"),
    }
    inspector = inspect(conn)
    backlog_cols = {c["name"] for c in inspector.get_columns("backlogs")}
    order_col = "display_order" if "display_order" in backlog_cols else "rank"
    data["backlogs"] = (
        conn.execute(text(f"SELECT * FROM backlogs ORDER BY project_id, {order_col}"))
        .mappings()
        .all()
    )
    return data


def _drop_old_tables(conn: Connection) -> None:
    """Drop v1 tables and adjust backlogs schema."""
    for table in [
        "backlog_stories",
        "backlog_tasks",
        "story_labels",
        "task_labels",
        "task_assignments",
        "epic_status_history",
        "story_status_history",
        "task_status_history",
        "tasks",
        "stories",
        "epics",
    ]:
        conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    conn.execute(text("ALTER TABLE backlogs DROP COLUMN IF EXISTS display_order"))
    conn.execute(
        text("ALTER TABLE backlogs ADD COLUMN IF NOT EXISTS" + " rank TEXT NOT NULL DEFAULT 'n'")
    )


def _create_new_tables(conn: Connection) -> None:
    """Create the v2 schema tables."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_items (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES work_items(id) ON DELETE SET NULL,
            key TEXT,
            type TEXT NOT NULL,
            sub_type TEXT,
            title TEXT NOT NULL,
            summary TEXT,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'TODO',
            status_mode TEXT NOT NULL DEFAULT 'MANUAL',
            status_override TEXT,
            status_override_set_at TEXT,
            is_blocked INTEGER NOT NULL DEFAULT 0,
            blocked_reason TEXT,
            priority INTEGER,
            estimate_points REAL,
            due_at TEXT,
            current_assignee_agent_id TEXT
                REFERENCES agents(id) ON DELETE SET NULL,
            metadata_json TEXT,
            created_by TEXT,
            updated_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS backlog_items (
            backlog_id TEXT NOT NULL
                REFERENCES backlogs(id) ON DELETE CASCADE,
            work_item_id TEXT NOT NULL
                REFERENCES work_items(id) ON DELETE CASCADE,
            rank TEXT NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (backlog_id, work_item_id),
            UNIQUE (work_item_id)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_item_labels (
            work_item_id TEXT NOT NULL
                REFERENCES work_items(id) ON DELETE CASCADE,
            label_id TEXT NOT NULL
                REFERENCES labels(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL,
            PRIMARY KEY (work_item_id, label_id)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_item_assignments (
            id TEXT PRIMARY KEY,
            work_item_id TEXT NOT NULL
                REFERENCES work_items(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL
                REFERENCES agents(id) ON DELETE CASCADE,
            assigned_at TEXT NOT NULL,
            unassigned_at TEXT,
            assigned_by TEXT,
            reason TEXT
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_item_status_history (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            work_item_id TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT NOT NULL,
            changed_by TEXT,
            changed_at TEXT NOT NULL,
            note TEXT
        )
    """))


_INSERT_WORK_ITEM = """
    INSERT INTO work_items (
        id, project_id, parent_id, key, type, sub_type,
        title, summary, description,
        status, status_mode, status_override,
        status_override_set_at,
        is_blocked, blocked_reason, priority,
        estimate_points, due_at, current_assignee_agent_id,
        metadata_json, created_by, updated_by,
        created_at, updated_at, started_at, completed_at
    ) VALUES (
        :id, :project_id, :parent_id, :key, :type, :sub_type,
        :title, :summary, :description,
        :status, :status_mode, :status_override,
        :status_override_set_at,
        :is_blocked, :blocked_reason, :priority,
        :estimate_points, :due_at,
        :current_assignee_agent_id,
        :metadata_json, :created_by, :updated_by,
        :created_at, :updated_at, :started_at, :completed_at
    )
"""


def _insert_work_items(conn: Connection, old: dict[str, Any]) -> None:
    """Insert epics, stories, and tasks as work_items."""
    stmt = text(_INSERT_WORK_ITEM)

    logger.info("Migrating epics -> work_items (EPIC)...")
    for e in old["epics"]:
        params = dict(e)
        params.update(
            parent_id=None,
            type="EPIC",
            sub_type=None,
            summary=e["description"],
            description=None,
            estimate_points=None,
            due_at=None,
            current_assignee_agent_id=None,
            started_at=None,
            completed_at=None,
        )
        conn.execute(stmt, params)

    logger.info("Migrating stories -> work_items (STORY)...")
    for s in old["stories"]:
        params = dict(s)
        params.update(
            parent_id=s["epic_id"],
            type="STORY",
            sub_type=s["story_type"],
            summary=s["intent"],
            status_mode="MANUAL",
            status_override=None,
            status_override_set_at=None,
            estimate_points=None,
            due_at=None,
        )
        conn.execute(stmt, params)

    logger.info("Migrating tasks -> work_items (TASK)...")
    for t in old["tasks"]:
        params = dict(t)
        params.update(
            parent_id=t["story_id"],
            type="TASK",
            sub_type=t["task_type"],
            summary=t["objective"],
            description=None,
            status_mode="MANUAL",
            status_override=None,
            status_override_set_at=None,
        )
        conn.execute(stmt, params)


def _migrate_backlog_items(conn: Connection, old: dict[str, Any]) -> None:
    """Migrate backlog membership and backlog ranks."""
    logger.info("Migrating backlog membership -> backlog_items...")
    backlog_items_map: dict[str, list[dict]] = {}
    for bs in old["bs"]:
        bid = bs["backlog_id"]
        backlog_items_map.setdefault(bid, []).append(
            {"work_item_id": bs["story_id"], "added_at": bs["added_at"]}
        )
    for bt in old["bt"]:
        bid = bt["backlog_id"]
        backlog_items_map.setdefault(bid, []).append(
            {"work_item_id": bt["task_id"], "added_at": bt["added_at"]}
        )

    for bid, items in backlog_items_map.items():
        ranks = rank_batch(len(items))
        for item, rank in zip(items, ranks):
            conn.execute(
                text("""
                    INSERT INTO backlog_items
                        (backlog_id, work_item_id, rank, added_at)
                    VALUES (:bid, :wid, :rank, :added_at)
                """),
                {
                    "bid": bid,
                    "wid": item["work_item_id"],
                    "rank": rank,
                    "added_at": item["added_at"],
                },
            )

    logger.info("Assigning backlog ranks...")
    by_project: dict[str | None, list[dict]] = {}
    for b in old["backlogs"]:
        by_project.setdefault(b["project_id"], []).append(dict(b))

    for _pid, blist in by_project.items():
        ranks = rank_batch(len(blist))
        for backlog, rank in zip(blist, ranks):
            conn.execute(
                text("UPDATE backlogs SET rank = :rank WHERE id = :id"),
                {"rank": rank, "id": backlog["id"]},
            )


def _migrate_labels_assignments_history(conn: Connection, old: dict[str, Any]) -> None:
    """Migrate labels, assignments, and status history."""
    logger.info("Migrating labels...")
    for sl in old["story_labels"]:
        conn.execute(
            text("""
                INSERT INTO work_item_labels
                    (work_item_id, label_id, added_at)
                VALUES (:wid, :lid, :added_at)
            """),
            {
                "wid": sl["story_id"],
                "lid": sl["label_id"],
                "added_at": sl["added_at"],
            },
        )

    for tl in old["task_labels"]:
        conn.execute(
            text("""
                INSERT INTO work_item_labels
                    (work_item_id, label_id, added_at)
                VALUES (:wid, :lid, :added_at)
            """),
            {
                "wid": tl["task_id"],
                "lid": tl["label_id"],
                "added_at": tl["added_at"],
            },
        )

    logger.info("Migrating assignments...")
    for ta in old["task_assignments"]:
        conn.execute(
            text("""
                INSERT INTO work_item_assignments
                    (id, work_item_id, agent_id,
                     assigned_at, unassigned_at,
                     assigned_by, reason)
                VALUES (:id, :wid, :aid, :assigned_at,
                        :unassigned_at, :assigned_by, :reason)
            """),
            {
                "id": ta["id"],
                "wid": ta["task_id"],
                "aid": ta["agent_id"],
                "assigned_at": ta["assigned_at"],
                "unassigned_at": ta["unassigned_at"],
                "assigned_by": ta["assigned_by"],
                "reason": ta["reason"],
            },
        )

    _migrate_status_history(conn, old)


def _migrate_status_history(conn: Connection, old: dict[str, Any]) -> None:
    """Migrate status history records."""
    logger.info("Migrating status histories...")
    hist_sql = text("""
        INSERT INTO work_item_status_history
            (id, project_id, work_item_id, from_status,
             to_status, changed_by, changed_at, note)
        VALUES (:id, :project_id, :wid, :from_status,
                :to_status, :changed_by, :changed_at, :note)
    """)

    for h in old["epic_hist"]:
        conn.execute(hist_sql, {**dict(h), "wid": h["epic_id"]})

    for h in old["story_hist"]:
        conn.execute(hist_sql, {**dict(h), "wid": h["story_id"]})

    for h in old["task_hist"]:
        conn.execute(hist_sql, {**dict(h), "wid": h["task_id"]})


def _create_indexes(conn: Connection) -> None:
    stmts = [
        ("CREATE INDEX IF NOT EXISTS idx_work_items_project_id" + " ON work_items(project_id)"),
        ("CREATE INDEX IF NOT EXISTS idx_work_items_parent_id" + " ON work_items(parent_id)"),
        ("CREATE INDEX IF NOT EXISTS idx_work_items_type" + " ON work_items(type)"),
        ("CREATE INDEX IF NOT EXISTS idx_work_items_status" + " ON work_items(status)"),
        (
            "CREATE INDEX IF NOT EXISTS idx_work_items_project_type"
            + " ON work_items(project_id, type)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS idx_work_items_parent_status"
            + " ON work_items(parent_id, status)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS idx_backlog_items_backlog_rank"
            + " ON backlog_items(backlog_id, rank)"
        ),
        ("CREATE INDEX IF NOT EXISTS idx_backlogs_project_rank" + " ON backlogs(project_id, rank)"),
        (
            "CREATE UNIQUE INDEX IF NOT EXISTS"
            + " idx_work_item_assignments_active"
            + " ON work_item_assignments(work_item_id)"
            + " WHERE unassigned_at IS NULL"
        ),
        (
            "CREATE INDEX IF NOT EXISTS"
            + " idx_work_item_status_history_item"
            + " ON work_item_status_history(work_item_id, changed_at)"
        ),
    ]
    for stmt in stmts:
        conn.execute(text(stmt))


def _verify_migration(conn: Connection, old: dict[str, Any]) -> None:
    """Verify row counts after migration."""
    new_wi = conn.execute(text("SELECT COUNT(*) FROM work_items")).scalar_one()
    expected_wi = len(old["epics"]) + len(old["stories"]) + len(old["tasks"])
    assert new_wi == expected_wi, f"work_items count mismatch: got {new_wi}, expected {expected_wi}"

    new_bi = conn.execute(text("SELECT COUNT(*) FROM backlog_items")).scalar_one()
    expected_bi = len(old["bs"]) + len(old["bt"])
    assert (
        new_bi == expected_bi
    ), f"backlog_items count mismatch: got {new_bi}, expected {expected_bi}"

    logger.info(
        "Migration complete: %d work items, %d backlog items",
        new_wi,
        new_bi,
    )


def migrate_v1_to_v2(conn: Connection) -> None:
    """Run the full v1->v2 data migration inside the Alembic transaction."""
    logger.info("Reading old data...")
    old = _read_old_data(conn)

    logger.info(
        "Old counts: %d epics, %d stories, %d tasks, "
        "%d backlog_stories, %d backlog_tasks, "
        "%d story_labels, %d task_labels, %d assignments",
        len(old["epics"]),
        len(old["stories"]),
        len(old["tasks"]),
        len(old["bs"]),
        len(old["bt"]),
        len(old["story_labels"]),
        len(old["task_labels"]),
        len(old["task_assignments"]),
    )

    logger.info("Dropping old tables...")
    _drop_old_tables(conn)

    logger.info("Creating new tables...")
    _create_new_tables(conn)

    _insert_work_items(conn, old)
    _migrate_backlog_items(conn, old)
    _migrate_labels_assignments_history(conn, old)

    logger.info("Creating indexes...")
    _create_indexes(conn)

    logger.info("Verifying migration...")
    _verify_migration(conn, old)
