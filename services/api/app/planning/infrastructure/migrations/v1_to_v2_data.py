"""Data transformation: stories/tasks/epics → work_items.

Called from the Alembic migration. Reads old data, transforms, writes
into new tables. Verifies counts after migration.
"""

import logging

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
    return conn.execute(text(f"SELECT * FROM {table_name}")).mappings().all()


def _safe_read_ordered(conn: Connection, table_name: str, order: str) -> list:
    """Read all rows ordered, returning [] if the table doesn't exist."""
    inspector = inspect(conn)
    if table_name not in inspector.get_table_names():
        logger.info("Table %s does not exist, skipping", table_name)
        return []
    return conn.execute(text(f"SELECT * FROM {table_name} ORDER BY {order}")).mappings().all()


def migrate_v1_to_v2(conn: Connection) -> None:
    """Run the full v1→v2 data migration inside the Alembic transaction."""
    logger.info("Reading old data...")

    old_epics = _safe_read(conn, "epics")
    old_stories = _safe_read(conn, "stories")
    old_tasks = _safe_read(conn, "tasks")
    old_bs = _safe_read_ordered(conn, "backlog_stories", "backlog_id, position")
    old_bt = _safe_read_ordered(conn, "backlog_tasks", "backlog_id, position")
    old_story_labels = _safe_read(conn, "story_labels")
    old_task_labels = _safe_read(conn, "task_labels")
    old_task_assignments = _safe_read(conn, "task_assignments")
    # Backlogs always exist — check if display_order column is present.
    inspector = inspect(conn)
    backlog_cols = {c["name"] for c in inspector.get_columns("backlogs")}
    if "display_order" in backlog_cols:
        old_backlogs = conn.execute(
            text("SELECT * FROM backlogs ORDER BY project_id, display_order")
        ).mappings().all()
    else:
        old_backlogs = conn.execute(
            text("SELECT * FROM backlogs ORDER BY project_id, rank")
        ).mappings().all()

    old_epic_hist = _safe_read(conn, "epic_status_history")
    old_story_hist = _safe_read(conn, "story_status_history")
    old_task_hist = _safe_read(conn, "task_status_history")

    logger.info(
        "Old counts: %d epics, %d stories, %d tasks, %d backlog_stories, "
        "%d backlog_tasks, %d story_labels, %d task_labels, %d assignments",
        len(old_epics), len(old_stories), len(old_tasks),
        len(old_bs), len(old_bt),
        len(old_story_labels), len(old_task_labels), len(old_task_assignments),
    )

    # ------------------------------------------------------------------
    # Phase 1: Drop old tables
    # ------------------------------------------------------------------
    logger.info("Dropping old tables...")
    for table in [
        "backlog_stories", "backlog_tasks",
        "story_labels", "task_labels", "task_assignments",
        "epic_status_history", "story_status_history", "task_status_history",
        "tasks", "stories", "epics",
    ]:
        conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    # Drop old display_order column from backlogs, add rank.
    conn.execute(text("ALTER TABLE backlogs DROP COLUMN IF EXISTS display_order"))
    conn.execute(text(
        "ALTER TABLE backlogs ADD COLUMN IF NOT EXISTS rank TEXT NOT NULL DEFAULT 'n'"
    ))

    # ------------------------------------------------------------------
    # Phase 2: Create new tables
    # ------------------------------------------------------------------
    logger.info("Creating new tables...")

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
            current_assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
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
            backlog_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
            work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
            rank TEXT NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (backlog_id, work_item_id),
            UNIQUE (work_item_id)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_item_labels (
            work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
            label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL,
            PRIMARY KEY (work_item_id, label_id)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS work_item_assignments (
            id TEXT PRIMARY KEY,
            work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
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

    # ------------------------------------------------------------------
    # Phase 3: Insert work items
    # ------------------------------------------------------------------
    logger.info("Migrating epics → work_items (EPIC)...")
    for e in old_epics:
        conn.execute(text("""
            INSERT INTO work_items (
                id, project_id, parent_id, key, type, sub_type,
                title, summary, description,
                status, status_mode, status_override, status_override_set_at,
                is_blocked, blocked_reason, priority,
                estimate_points, due_at, current_assignee_agent_id,
                metadata_json, created_by, updated_by,
                created_at, updated_at, started_at, completed_at
            ) VALUES (
                :id, :project_id, NULL, :key, 'EPIC', NULL,
                :title, :description, NULL,
                :status, :status_mode, :status_override, :status_override_set_at,
                :is_blocked, :blocked_reason, :priority,
                NULL, NULL, NULL,
                :metadata_json, :created_by, :updated_by,
                :created_at, :updated_at, NULL, NULL
            )
        """), dict(e))

    logger.info("Migrating stories → work_items (STORY)...")
    for s in old_stories:
        params = dict(s)
        params["parent_id"] = s["epic_id"]
        params["sub_type"] = s["story_type"]
        params["summary"] = s["intent"]
        conn.execute(text("""
            INSERT INTO work_items (
                id, project_id, parent_id, key, type, sub_type,
                title, summary, description,
                status, status_mode, status_override, status_override_set_at,
                is_blocked, blocked_reason, priority,
                estimate_points, due_at, current_assignee_agent_id,
                metadata_json, created_by, updated_by,
                created_at, updated_at, started_at, completed_at
            ) VALUES (
                :id, :project_id, :parent_id, :key, 'STORY', :sub_type,
                :title, :summary, :description,
                :status, 'MANUAL', NULL, NULL,
                :is_blocked, :blocked_reason, :priority,
                NULL, NULL, :current_assignee_agent_id,
                :metadata_json, :created_by, :updated_by,
                :created_at, :updated_at, :started_at, :completed_at
            )
        """), params)

    logger.info("Migrating tasks → work_items (TASK)...")
    for t in old_tasks:
        params = dict(t)
        params["parent_id"] = t["story_id"]
        params["sub_type"] = t["task_type"]
        params["summary"] = t["objective"]
        conn.execute(text("""
            INSERT INTO work_items (
                id, project_id, parent_id, key, type, sub_type,
                title, summary, description,
                status, status_mode, status_override, status_override_set_at,
                is_blocked, blocked_reason, priority,
                estimate_points, due_at, current_assignee_agent_id,
                metadata_json, created_by, updated_by,
                created_at, updated_at, started_at, completed_at
            ) VALUES (
                :id, :project_id, :parent_id, :key, 'TASK', :sub_type,
                :title, :summary, NULL,
                :status, 'MANUAL', NULL, NULL,
                :is_blocked, :blocked_reason, :priority,
                :estimate_points, :due_at, :current_assignee_agent_id,
                :metadata_json, :created_by, :updated_by,
                :created_at, :updated_at, :started_at, :completed_at
            )
        """), params)

    # ------------------------------------------------------------------
    # Phase 4: Backlog items with LexoRank
    # ------------------------------------------------------------------
    logger.info("Migrating backlog membership → backlog_items...")
    # Group by backlog_id.
    backlog_items_map: dict[str, list[dict]] = {}
    for bs in old_bs:
        bid = bs["backlog_id"]
        backlog_items_map.setdefault(bid, []).append(
            {"work_item_id": bs["story_id"], "added_at": bs["added_at"]}
        )
    for bt in old_bt:
        bid = bt["backlog_id"]
        backlog_items_map.setdefault(bid, []).append(
            {"work_item_id": bt["task_id"], "added_at": bt["added_at"]}
        )

    for bid, items in backlog_items_map.items():
        ranks = rank_batch(len(items))
        for item, rank in zip(items, ranks):
            conn.execute(text("""
                INSERT INTO backlog_items (backlog_id, work_item_id, rank, added_at)
                VALUES (:bid, :wid, :rank, :added_at)
            """), {"bid": bid, "wid": item["work_item_id"], "rank": rank, "added_at": item["added_at"]})

    # ------------------------------------------------------------------
    # Phase 5: Backlog rank (from display_order)
    # ------------------------------------------------------------------
    logger.info("Assigning backlog ranks...")
    by_project: dict[str | None, list[dict]] = {}
    for b in old_backlogs:
        by_project.setdefault(b["project_id"], []).append(dict(b))

    for _pid, blist in by_project.items():
        ranks = rank_batch(len(blist))
        for backlog, rank in zip(blist, ranks):
            conn.execute(
                text("UPDATE backlogs SET rank = :rank WHERE id = :id"),
                {"rank": rank, "id": backlog["id"]},
            )

    # ------------------------------------------------------------------
    # Phase 6: Labels, assignments, status history
    # ------------------------------------------------------------------
    logger.info("Migrating labels...")
    for sl in old_story_labels:
        conn.execute(text("""
            INSERT INTO work_item_labels (work_item_id, label_id, added_at)
            VALUES (:wid, :lid, :added_at)
        """), {"wid": sl["story_id"], "lid": sl["label_id"], "added_at": sl["added_at"]})

    for tl in old_task_labels:
        conn.execute(text("""
            INSERT INTO work_item_labels (work_item_id, label_id, added_at)
            VALUES (:wid, :lid, :added_at)
        """), {"wid": tl["task_id"], "lid": tl["label_id"], "added_at": tl["added_at"]})

    logger.info("Migrating assignments...")
    for ta in old_task_assignments:
        conn.execute(text("""
            INSERT INTO work_item_assignments (id, work_item_id, agent_id,
                assigned_at, unassigned_at, assigned_by, reason)
            VALUES (:id, :wid, :aid, :assigned_at, :unassigned_at, :assigned_by, :reason)
        """), {
            "id": ta["id"], "wid": ta["task_id"], "aid": ta["agent_id"],
            "assigned_at": ta["assigned_at"], "unassigned_at": ta["unassigned_at"],
            "assigned_by": ta["assigned_by"], "reason": ta["reason"],
        })

    logger.info("Migrating status histories...")
    for h in old_epic_hist:
        conn.execute(text("""
            INSERT INTO work_item_status_history
                (id, project_id, work_item_id, from_status, to_status, changed_by, changed_at, note)
            VALUES (:id, :project_id, :wid, :from_status, :to_status, :changed_by, :changed_at, :note)
        """), {**dict(h), "wid": h["epic_id"]})

    for h in old_story_hist:
        conn.execute(text("""
            INSERT INTO work_item_status_history
                (id, project_id, work_item_id, from_status, to_status, changed_by, changed_at, note)
            VALUES (:id, :project_id, :wid, :from_status, :to_status, :changed_by, :changed_at, :note)
        """), {**dict(h), "wid": h["story_id"]})

    for h in old_task_hist:
        conn.execute(text("""
            INSERT INTO work_item_status_history
                (id, project_id, work_item_id, from_status, to_status, changed_by, changed_at, note)
            VALUES (:id, :project_id, :wid, :from_status, :to_status, :changed_by, :changed_at, :note)
        """), {**dict(h), "wid": h["task_id"]})

    # ------------------------------------------------------------------
    # Phase 7: Create indexes
    # ------------------------------------------------------------------
    logger.info("Creating indexes...")
    _create_indexes(conn)

    # ------------------------------------------------------------------
    # Phase 8: Verify
    # ------------------------------------------------------------------
    logger.info("Verifying migration...")
    new_wi_count = conn.execute(text("SELECT COUNT(*) FROM work_items")).scalar_one()
    expected = len(old_epics) + len(old_stories) + len(old_tasks)
    assert new_wi_count == expected, (
        f"work_items count mismatch: got {new_wi_count}, expected {expected}"
    )

    new_bi_count = conn.execute(text("SELECT COUNT(*) FROM backlog_items")).scalar_one()
    expected_bi = len(old_bs) + len(old_bt)
    assert new_bi_count == expected_bi, (
        f"backlog_items count mismatch: got {new_bi_count}, expected {expected_bi}"
    )

    logger.info("Migration complete: %d work items, %d backlog items", new_wi_count, new_bi_count)


def _create_indexes(conn: Connection) -> None:
    stmts = [
        "CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON work_items(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_work_items_parent_id ON work_items(parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_work_items_type ON work_items(type)",
        "CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status)",
        "CREATE INDEX IF NOT EXISTS idx_work_items_project_type ON work_items(project_id, type)",
        "CREATE INDEX IF NOT EXISTS idx_work_items_parent_status ON work_items(parent_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_backlog_items_backlog_rank ON backlog_items(backlog_id, rank)",
        "CREATE INDEX IF NOT EXISTS idx_backlogs_project_rank ON backlogs(project_id, rank)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_work_item_assignments_active ON work_item_assignments(work_item_id) WHERE unassigned_at IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_work_item_status_history_item ON work_item_status_history(work_item_id, changed_at)",
    ]
    for stmt in stmts:
        conn.execute(text(stmt))
