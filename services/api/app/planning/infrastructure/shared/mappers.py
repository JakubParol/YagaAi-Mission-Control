from sqlalchemy.engine import RowMapping

from app.planning.domain.models import (
    Agent,
    AgentSource,
    Backlog,
    BacklogItem,
    BacklogKind,
    BacklogStatus,
    Label,
    Project,
    ProjectStatus,
    StatusMode,
    WorkItem,
    WorkItemAssignment,
    WorkItemStatus,
    WorkItemType,
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


def _row_to_work_item(m: RowMapping) -> WorkItem:
    return WorkItem(
        id=m["id"],
        project_id=m["project_id"],
        parent_id=m["parent_id"],
        key=m["key"],
        type=WorkItemType(m["type"]),
        sub_type=m["sub_type"],
        title=m["title"],
        summary=m["summary"],
        description=m["description"],
        status=WorkItemStatus(m["status"]),
        status_mode=StatusMode(m["status_mode"]),
        status_override=m["status_override"],
        status_override_set_at=m["status_override_set_at"],
        is_blocked=bool(m["is_blocked"]),
        blocked_reason=m["blocked_reason"],
        priority=m["priority"],
        estimate_points=m["estimate_points"],
        due_at=m["due_at"],
        current_assignee_agent_id=(
            m["current_assignee_agent_id"] if "current_assignee_agent_id" in m else None
        ),
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
        main_session_key=m.get("main_session_key"),
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
        rank=m["rank"],
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


def _row_to_backlog_item(m: RowMapping) -> BacklogItem:
    return BacklogItem(
        backlog_id=m["backlog_id"],
        work_item_id=m["work_item_id"],
        rank=m["rank"],
        added_at=m["added_at"],
    )


def _row_to_work_item_assignment(m: RowMapping) -> WorkItemAssignment:
    return WorkItemAssignment(
        id=m["id"],
        work_item_id=m["work_item_id"],
        agent_id=m["agent_id"],
        assigned_at=m["assigned_at"],
        unassigned_at=m["unassigned_at"],
        assigned_by=m["assigned_by"],
        reason=m["reason"],
    )
