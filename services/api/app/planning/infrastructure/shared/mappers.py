from app.planning.domain.models import (
    Agent,
    AgentSource,
    Backlog,
    BacklogKind,
    BacklogStatus,
    Epic,
    EpicOverview,
    EpicStatus,
    ItemStatus,
    Label,
    Project,
    ProjectStatus,
    StatusMode,
    Story,
    Task,
    TaskAssignment,
)
from app.planning.infrastructure.shared.sql import DbRow


def _row_to_project(row: DbRow) -> Project:
    return Project(
        id=row["id"],
        key=row["key"],
        name=row["name"],
        description=row["description"],
        status=ProjectStatus(row["status"]),
        is_default=bool(row["is_default"]),
        repo_root=row["repo_root"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_epic(row: DbRow) -> Epic:
    return Epic(
        id=row["id"],
        project_id=row["project_id"],
        key=row["key"],
        title=row["title"],
        description=row["description"],
        status=EpicStatus(row["status"]),
        status_mode=StatusMode(row["status_mode"]),
        status_override=row["status_override"],
        status_override_set_at=row["status_override_set_at"],
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_epic_overview(row: DbRow) -> EpicOverview:
    return EpicOverview(
        epic_key=row["epic_key"],
        title=row["title"],
        status=EpicStatus(row["status"]),
        progress_pct=float(row["progress_pct"]),
        progress_trend_7d=float(row["progress_trend_7d"]),
        stories_total=int(row["stories_total"]),
        stories_done=int(row["stories_done"]),
        stories_in_progress=int(row["stories_in_progress"]),
        blocked_count=int(row["blocked_count"]),
        stale_days=int(row["stale_days"]),
        priority=row["priority"],
        updated_at=row["updated_at"],
    )


def _row_to_story(row: DbRow) -> Story:
    current_assignee_agent_id = (
        row["current_assignee_agent_id"] if "current_assignee_agent_id" in row.keys() else None
    )
    return Story(
        id=row["id"],
        project_id=row["project_id"],
        epic_id=row["epic_id"],
        key=row["key"],
        title=row["title"],
        intent=row["intent"],
        description=row["description"],
        story_type=row["story_type"],
        status=ItemStatus(row["status"]),
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        current_assignee_agent_id=current_assignee_agent_id,
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _row_to_agent(row: DbRow) -> Agent:
    avatar = row["avatar"] if "avatar" in row.keys() else None
    last_name = row["last_name"] if "last_name" in row.keys() else None
    initials = row["initials"] if "initials" in row.keys() else None
    return Agent(
        id=row["id"],
        openclaw_key=row["openclaw_key"],
        name=row["name"],
        last_name=last_name,
        initials=initials,
        role=row["role"],
        worker_type=row["worker_type"],
        avatar=avatar,
        is_active=bool(row["is_active"]),
        source=AgentSource(row["source"]),
        metadata_json=row["metadata_json"],
        last_synced_at=row["last_synced_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_label(row: DbRow) -> Label:
    return Label(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        color=row["color"],
        created_at=row["created_at"],
    )


def _row_to_backlog(row: DbRow) -> Backlog:
    return Backlog(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        kind=BacklogKind(row["kind"]),
        status=BacklogStatus(row["status"]),
        display_order=row["display_order"],
        is_default=bool(row["is_default"]),
        goal=row["goal"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_task(row: DbRow) -> Task:
    return Task(
        id=row["id"],
        project_id=row["project_id"],
        story_id=row["story_id"],
        key=row["key"],
        title=row["title"],
        objective=row["objective"],
        task_type=row["task_type"],
        status=ItemStatus(row["status"]),
        is_blocked=bool(row["is_blocked"]),
        blocked_reason=row["blocked_reason"],
        priority=row["priority"],
        estimate_points=row["estimate_points"],
        due_at=row["due_at"],
        current_assignee_agent_id=row["current_assignee_agent_id"],
        metadata_json=row["metadata_json"],
        created_by=row["created_by"],
        updated_by=row["updated_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


def _row_to_assignment(row: DbRow) -> TaskAssignment:
    return TaskAssignment(
        id=row["id"],
        task_id=row["task_id"],
        agent_id=row["agent_id"],
        assigned_at=row["assigned_at"],
        unassigned_at=row["unassigned_at"],
        assigned_by=row["assigned_by"],
        reason=row["reason"],
    )
