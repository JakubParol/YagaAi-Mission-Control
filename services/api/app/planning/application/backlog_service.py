from typing import Any

from app.planning.application.ports.backlog import BacklogRepository
from app.planning.domain.models import Backlog, BacklogKind, BacklogStatus
from app.shared.api.errors import BusinessRuleError, ConflictError, NotFoundError
from app.shared.lexorank import rank_after as lr_after
from app.shared.utils import new_uuid, utc_now

ActiveSprintResult = tuple[Backlog, list[dict[str, Any]]]
MembershipMoveResult = dict[str, Any]


class BacklogService:
    def __init__(self, repo: BacklogRepository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # List / Get
    # ------------------------------------------------------------------

    async def list_backlogs(
        self,
        *,
        project_id: str | None = None,
        filter_global: bool = False,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: str | None = None,
    ) -> tuple[list[Backlog], int]:
        return await self._repo.list_all(
            project_id=project_id,
            filter_global=filter_global,
            status=status,
            kind=kind,
            limit=limit,
            offset=offset,
            sort=sort,
        )

    async def get_backlog(self, backlog_id: str) -> Backlog:
        backlog = await self._repo.get_by_id(backlog_id)
        if not backlog:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return backlog

    async def get_backlog_counts(self, backlog_id: str) -> dict[str, int]:
        return {
            "item_count": await self._repo.get_item_count(backlog_id),
        }

    # ------------------------------------------------------------------
    # Create / Update / Delete
    # ------------------------------------------------------------------

    async def create_backlog(
        self,
        *,
        project_id: str | None = None,
        name: str,
        kind: BacklogKind,
        goal: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        actor: str | None = None,
    ) -> Backlog:
        now = utc_now()
        rank = await self._repo.next_rank(project_id)
        initial_status = (
            BacklogStatus.OPEN
            if kind == BacklogKind.SPRINT
            else BacklogStatus.ACTIVE
        )
        backlog = Backlog(
            id=new_uuid(),
            project_id=project_id,
            name=name,
            kind=kind,
            status=initial_status,
            rank=rank,
            is_default=False,
            goal=goal,
            start_date=start_date,
            end_date=end_date,
            metadata_json=None,
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
        )
        return await self._repo.create(backlog)

    async def update_backlog(
        self,
        backlog_id: str,
        data: dict[str, Any],
        *,
        actor: str | None = None,
        allow_status_update: bool = False,
        allow_kind_update: bool = False,
    ) -> Backlog:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")

        if "status" in data and not allow_status_update:
            raise BusinessRuleError(
                "Backlog status is lifecycle-managed. "
                "Use /backlogs/{id}/start or /backlogs/{id}/complete."
            )
        if "kind" in data and not allow_kind_update:
            raise BusinessRuleError(
                "Backlog kind changes are lifecycle-managed. "
                "Use /backlogs/{id}/transition-kind."
            )
        if "is_default" in data and data["is_default"] and not existing.is_default:
            raise BusinessRuleError("Cannot manually set a backlog as default")

        data["updated_by"] = actor
        data["updated_at"] = utc_now()

        updated = await self._repo.update(backlog_id, data)
        if not updated:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        return updated

    async def transition_backlog_kind(
        self,
        backlog_id: str,
        *,
        target_kind: BacklogKind,
        actor: str | None = None,
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind == target_kind:
            return backlog, {
                "transition": "TRANSITION_BACKLOG_KIND",
                "from_kind": backlog.kind.value,
                "to_kind": target_kind.value,
                "from_status": backlog.status.value,
                "to_status": backlog.status.value,
                "changed": False,
            }

        if backlog.is_default:
            raise BusinessRuleError("Cannot change kind of default backlog")
        if target_kind == BacklogKind.SPRINT and backlog.project_id is None:
            raise BusinessRuleError(
                "Only project-scoped backlogs can transition to SPRINT"
            )
        if (
            backlog.kind == BacklogKind.SPRINT
            and backlog.status == BacklogStatus.ACTIVE
        ):
            raise BusinessRuleError(
                "Cannot transition kind of an ACTIVE sprint. "
                "Complete sprint first."
            )

        target_status = backlog.status
        if target_kind == BacklogKind.SPRINT:
            target_status = BacklogStatus.OPEN

        if (
            target_kind == BacklogKind.BACKLOG
            and target_status == BacklogStatus.ACTIVE
            and backlog.project_id is not None
        ):
            active_pb = await self._repo.get_product_backlog(backlog.project_id)
            if active_pb and active_pb.id != backlog_id:
                raise ConflictError(
                    f"Project {backlog.project_id} already has active "
                    f"product backlog {active_pb.id}"
                )

        data: dict[str, Any] = {"kind": target_kind.value}
        if target_status != backlog.status:
            data["status"] = target_status.value

        updated = await self.update_backlog(
            backlog_id,
            data,
            actor=actor,
            allow_status_update=True,
            allow_kind_update=True,
        )
        return updated, {
            "transition": "TRANSITION_BACKLOG_KIND",
            "from_kind": backlog.kind.value,
            "to_kind": target_kind.value,
            "from_status": backlog.status.value,
            "to_status": updated.status.value,
            "changed": True,
        }

    async def delete_backlog(self, backlog_id: str) -> None:
        existing = await self._repo.get_by_id(backlog_id)
        if not existing:
            raise NotFoundError(f"Backlog {backlog_id} not found")
        if existing.is_default:
            raise BusinessRuleError("Cannot delete the default backlog")
        await self._repo.delete(backlog_id)

    # ------------------------------------------------------------------
    # Item membership (unified)
    # ------------------------------------------------------------------

    async def add_item_to_backlog(
        self,
        backlog_id: str,
        work_item_id: str,
        rank: str | None = None,
    ) -> dict[str, Any]:
        backlog = await self.get_backlog(backlog_id)
        exists, item_project_id = await self._repo.get_work_item_project_id(
            work_item_id
        )
        if not exists:
            raise NotFoundError(f"Work item {work_item_id} not found")

        self._validate_backlog_scope(
            backlog_project_id=backlog.project_id,
            item_project_id=item_project_id,
        )

        existing_backlog_id = await self._repo.work_item_backlog_id(
            work_item_id
        )
        if existing_backlog_id:
            raise ConflictError(
                f"Work item {work_item_id} already belongs to "
                f"backlog {existing_backlog_id}"
            )

        if rank is None:
            items = await self._repo.list_items(backlog_id)
            if items:
                last_rank = items[-1]["rank"]
                rank = lr_after(last_rank)
            else:
                rank = "n"

        item = await self._repo.add_item(backlog_id, work_item_id, rank)
        return {
            "backlog_id": item.backlog_id,
            "work_item_id": item.work_item_id,
            "rank": item.rank,
            "added_at": item.added_at,
        }

    async def remove_item_from_backlog(
        self, backlog_id: str, work_item_id: str
    ) -> None:
        await self.get_backlog(backlog_id)
        removed = await self._repo.remove_item(backlog_id, work_item_id)
        if not removed:
            raise NotFoundError(
                f"Work item {work_item_id} is not in backlog {backlog_id}"
            )

    async def update_item_rank(
        self,
        backlog_id: str,
        work_item_id: str,
        rank: str,
    ) -> None:
        await self.get_backlog(backlog_id)
        updated = await self._repo.update_item_rank(
            backlog_id, work_item_id, rank
        )
        if not updated:
            raise NotFoundError(
                f"Work item {work_item_id} is not in backlog {backlog_id}"
            )

    async def get_backlog_items(
        self, backlog_id: str
    ) -> list[dict[str, Any]]:
        await self.get_backlog(backlog_id)
        return await self._repo.list_items(backlog_id)

    # ------------------------------------------------------------------
    # Sprint lifecycle
    # ------------------------------------------------------------------

    async def get_active_sprint(
        self, project_id: str
    ) -> ActiveSprintResult:
        backlog, items = await self._repo.get_active_sprint_with_items(
            project_id
        )
        if not backlog:
            raise NotFoundError(
                f"No active sprint found for project {project_id}"
            )
        return backlog, items

    async def start_sprint(
        self, backlog_id: str, *, actor: str | None = None
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind != BacklogKind.SPRINT:
            raise BusinessRuleError(f"Backlog {backlog_id} is not a sprint")
        if backlog.project_id is None:
            raise BusinessRuleError(
                "Sprint lifecycle transitions require a project-scoped backlog"
            )
        if backlog.status == BacklogStatus.ACTIVE:
            raise BusinessRuleError(f"Sprint {backlog_id} is already ACTIVE")

        active = await self._repo.get_active_sprint_backlog(backlog.project_id)
        if active and active.id != backlog_id:
            raise ConflictError(
                f"Project {backlog.project_id} already has active "
                f"sprint {active.id}"
            )

        updated = await self.update_backlog(
            backlog_id,
            {"status": BacklogStatus.ACTIVE.value},
            actor=actor,
            allow_status_update=True,
        )
        meta = await self._build_sprint_meta(
            backlog_id=backlog_id,
            transition="START_SPRINT",
            from_status=backlog.status.value,
            to_status=BacklogStatus.ACTIVE.value,
            active_sprint_id=backlog_id,
        )
        return updated, meta

    async def complete_sprint(
        self,
        backlog_id: str,
        *,
        target_backlog_id: str,
        actor: str | None = None,
    ) -> tuple[Backlog, dict[str, Any]]:
        backlog = await self.get_backlog(backlog_id)
        if backlog.kind != BacklogKind.SPRINT:
            raise BusinessRuleError(f"Backlog {backlog_id} is not a sprint")
        if backlog.project_id is None:
            raise BusinessRuleError(
                "Sprint lifecycle transitions require a project-scoped backlog"
            )
        if backlog.status != BacklogStatus.ACTIVE:
            raise BusinessRuleError(
                f"Sprint {backlog_id} must be ACTIVE to complete"
            )

        target = await self._repo.get_by_id(target_backlog_id)
        if not target:
            raise NotFoundError(
                f"Target backlog {target_backlog_id} not found"
            )

        moved_count = await self._repo.move_non_done_items(
            source_backlog_id=backlog_id,
            target_backlog_id=target_backlog_id,
        )

        updated = await self.update_backlog(
            backlog_id,
            {"status": BacklogStatus.CLOSED.value},
            actor=actor,
            allow_status_update=True,
        )
        meta = await self._build_sprint_meta(
            backlog_id=backlog_id,
            transition="COMPLETE_SPRINT",
            from_status=backlog.status.value,
            to_status=BacklogStatus.CLOSED.value,
            active_sprint_id=None,
        )
        meta["moved_item_count"] = moved_count
        meta["target_backlog_id"] = target_backlog_id
        return updated, meta

    # ------------------------------------------------------------------
    # Item movement helpers
    # ------------------------------------------------------------------

    async def move_item_to_active_sprint(
        self,
        *,
        project_id: str,
        work_item_id: str,
    ) -> MembershipMoveResult:
        exists, item_project_id = await self._repo.get_work_item_project_id(
            work_item_id
        )
        if not exists:
            raise NotFoundError(f"Work item {work_item_id} not found")
        if item_project_id != project_id:
            raise BusinessRuleError(
                f"Work item {work_item_id} must belong to project {project_id}"
            )

        sprint = await self._repo.get_active_sprint_backlog(project_id)
        if sprint is None:
            raise NotFoundError(
                f"No active sprint found for project {project_id}"
            )
        pb = await self._repo.get_product_backlog(project_id)
        if pb is None:
            raise NotFoundError(
                f"No product backlog found for project {project_id}"
            )

        current_backlog_id, _ = await self._repo.get_item_backlog_info(
            work_item_id
        )
        if current_backlog_id == sprint.id:
            return {
                "work_item_id": work_item_id,
                "source_backlog_id": sprint.id,
                "target_backlog_id": sprint.id,
                "moved": False,
            }
        if current_backlog_id != pb.id:
            raise BusinessRuleError(
                f"Work item {work_item_id} must be in product backlog "
                f"{pb.id} to join active sprint"
            )

        # Compute rank for appending at end of sprint.
        sprint_items = await self._repo.list_items(sprint.id)
        rank = (
            lr_after(sprint_items[-1]["rank"]) if sprint_items else "n"
        )

        await self._repo.move_item(
            source_backlog_id=pb.id,
            target_backlog_id=sprint.id,
            work_item_id=work_item_id,
            rank=rank,
        )
        return {
            "work_item_id": work_item_id,
            "source_backlog_id": pb.id,
            "target_backlog_id": sprint.id,
            "moved": True,
        }

    async def move_item_to_product_backlog(
        self,
        *,
        project_id: str,
        work_item_id: str,
    ) -> MembershipMoveResult:
        exists, item_project_id = await self._repo.get_work_item_project_id(
            work_item_id
        )
        if not exists:
            raise NotFoundError(f"Work item {work_item_id} not found")
        if item_project_id != project_id:
            raise BusinessRuleError(
                f"Work item {work_item_id} must belong to project {project_id}"
            )

        sprint = await self._repo.get_active_sprint_backlog(project_id)
        if sprint is None:
            raise NotFoundError(
                f"No active sprint found for project {project_id}"
            )
        pb = await self._repo.get_product_backlog(project_id)
        if pb is None:
            raise NotFoundError(
                f"No product backlog found for project {project_id}"
            )

        current_backlog_id, _ = await self._repo.get_item_backlog_info(
            work_item_id
        )
        if current_backlog_id == pb.id:
            return {
                "work_item_id": work_item_id,
                "source_backlog_id": pb.id,
                "target_backlog_id": pb.id,
                "moved": False,
            }
        if current_backlog_id != sprint.id:
            raise BusinessRuleError(
                f"Work item {work_item_id} must be in active sprint "
                f"{sprint.id} to return to product backlog"
            )

        pb_items = await self._repo.list_items(pb.id)
        rank = lr_after(pb_items[-1]["rank"]) if pb_items else "n"

        await self._repo.move_item(
            source_backlog_id=sprint.id,
            target_backlog_id=pb.id,
            work_item_id=work_item_id,
            rank=rank,
        )
        return {
            "work_item_id": work_item_id,
            "source_backlog_id": sprint.id,
            "target_backlog_id": pb.id,
            "moved": True,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _validate_backlog_scope(
        self,
        *,
        backlog_project_id: str | None,
        item_project_id: str | None,
    ) -> None:
        if backlog_project_id is None and item_project_id is not None:
            raise BusinessRuleError(
                "Global backlog accepts only project-less work items"
            )
        if (
            backlog_project_id is not None
            and item_project_id != backlog_project_id
        ):
            raise BusinessRuleError(
                f"Work item must belong to project {backlog_project_id}"
            )

    async def _build_sprint_meta(
        self,
        *,
        backlog_id: str,
        transition: str,
        from_status: str,
        to_status: str,
        active_sprint_id: str | None,
    ) -> dict[str, Any]:
        items = await self._repo.list_items(backlog_id)
        total = len(items)
        done = len([i for i in items if i.get("status") == "DONE"])
        return {
            "transition": transition,
            "from_status": from_status,
            "to_status": to_status,
            "item_count": total,
            "done_item_count": done,
            "unfinished_item_count": total - done,
            "active_sprint_id": active_sprint_id,
        }
