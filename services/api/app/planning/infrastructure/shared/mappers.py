from sqlalchemy.engine import RowMapping

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


def _row_to_project(m: RowMapping) -> Project:
    return Project(
        id=m["id"],
        key=m["key"],
        name=m["name"],
        description=m["description"],
        status=ProjectStatus(m["status"]),
        is_default=bool(m["is_default"]),
        repo_root=m["repo_root"],
        created_by=m["created_by"],
        updated_by=m["updated_by"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


def _row_to_epic(m: RowMapping) -> Epic:
    return Epic(
        id=m["id"],
        project_id=m["project_id"],
        key=m["key"],
        title=m["title"],
        description=m["description"],
        status=EpicStatus(m["status"]),
        status_mode=StatusMode(m["status_mode"]),
        status_override=m["status_override"],
        status_override_set_at=m["status_override_set_at"],
        is_blocked=bool(m["is_blocked"]),
        blocked_reason=m["blocked_reason"],
        priority=m["priority"],
        metadata_json=m["metadata_json"],
        created_by=m["created_by"],
        updated_by=m["updated_by"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


def _row_to_epic_overview(m: RowMapping) -> EpicOverview:
    return EpicOverview(
        epic_key=m["epic_key"],
        title=m["title"],
        status=EpicStatus(m["status"]),
        progress_pct=float(m["progress_pct"]),
        progress_trend_7d=float(m["progress_trend_7d"]),
        stories_total=int(m["stories_total"]),
        stories_done=int(m["stories_done"]),
        stories_in_progress=int(m["stories_in_progress"]),
        blocked_count=int(m["blocked_count"]),
        stale_days=int(m["stale_days"]),
        priority=m["priority"],
        updated_at=m["updated_at"],
    )


def _row_to_story(m: RowMapping) -> Story:
    current_assignee_agent_id = (
        m["current_assignee_agent_id"] if "current_assignee_agent_id" in m else None
    )
    return Story(
        id=m["id"],
        project_id=m["project_id"],
        epic_id=m["epic_id"],
        key=m["key"],
        title=m["title"],
        intent=m["intent"],
        description=m["description"],
        story_type=m["story_type"],
        status=ItemStatus(m["status"]),
        is_blocked=bool(m["is_blocked"]),
        blocked_reason=m["blocked_reason"],
        priority=m["priority"],
        current_assignee_agent_id=current_assignee_agent_id,
        metadata_json=m["metadata_json"],
        created_by=m["created_by"],
        updated_by=m["updated_by"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
        started_at=m["started_at"],
        completed_at=m["completed_at"],
    )


def _row_to_agent(m: RowMapping) -> Agent:
    avatar = m["avatar"] if "avatar" in m else None
    last_name = m["last_name"] if "last_name" in m else None
    initials = m["initials"] if "initials" in m else None
    return Agent(
        id=m["id"],
        openclaw_key=m["openclaw_key"],
        name=m["name"],
        last_name=last_name,
        initials=initials,
        role=m["role"],
        worker_type=m["worker_type"],
        avatar=avatar,
        is_active=bool(m["is_active"]),
        source=AgentSource(m["source"]),
        metadata_json=m["metadata_json"],
        last_synced_at=m["last_synced_at"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


def _row_to_label(m: RowMapping) -> Label:
    return Label(
        id=m["id"],
        project_id=m["project_id"],
        name=m["name"],
        color=m["color"],
        created_at=m["created_at"],
    )


def _row_to_backlog(m: RowMapping) -> Backlog:
    return Backlog(
        id=m["id"],
        project_id=m["project_id"],
        name=m["name"],
        kind=BacklogKind(m["kind"]),
        status=BacklogStatus(m["status"]),
        display_order=m["display_order"],
        is_default=bool(m["is_default"]),
        goal=m["goal"],
        start_date=m["start_date"],
        end_date=m["end_date"],
        metadata_json=m["metadata_json"],
        created_by=m["created_by"],
        updated_by=m["updated_by"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


def _row_to_task(m: RowMapping) -> Task:
    return Task(
        id=m["id"],
        project_id=m["project_id"],
        story_id=m["story_id"],
        key=m["key"],
        title=m["title"],
        objective=m["objective"],
        task_type=m["task_type"],
        status=ItemStatus(m["status"]),
        is_blocked=bool(m["is_blocked"]),
        blocked_reason=m["blocked_reason"],
        priority=m["priority"],
        estimate_points=m["estimate_points"],
        due_at=m["due_at"],
        current_assignee_agent_id=m["current_assignee_agent_id"],
        metadata_json=m["metadata_json"],
        created_by=m["created_by"],
        updated_by=m["updated_by"],
        created_at=m["created_at"],
        updated_at=m["updated_at"],
        started_at=m["started_at"],
        completed_at=m["completed_at"],
    )


def _row_to_assignment(m: RowMapping) -> TaskAssignment:
    return TaskAssignment(
        id=m["id"],
        task_id=m["task_id"],
        agent_id=m["agent_id"],
        assigned_at=m["assigned_at"],
        unassigned_at=m["unassigned_at"],
        assigned_by=m["assigned_by"],
        reason=m["reason"],
    )
