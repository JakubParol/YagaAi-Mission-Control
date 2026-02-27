import asyncio
import logging
import os
import re
from pathlib import Path

import yaml

from app.observability.application.ports import SupervisorAdapterPort
from app.observability.domain.models import (
    AgentStatus,
    ResultFile,
    SupervisorStory,
    SupervisorTask,
    TaskResult,
)

logger = logging.getLogger(__name__)

TASK_STATES = ("BACKLOG", "PLANNED", "ASSIGNED", "DONE", "BLOCKED")

TEXT_EXTENSIONS = frozenset(
    {
        ".md",
        ".txt",
        ".yaml",
        ".yml",
        ".json",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".css",
        ".html",
        ".log",
        ".csv",
        ".xml",
        ".toml",
        ".sh",
        ".py",
        ".rs",
        ".go",
    }
)

_AGENT_CONFIGS = [
    {"name": "James", "role": "Supervisor / CSO", "worker_type": None},
    {"name": "Naomi", "role": "Principal Developer", "worker_type": "coder"},
    {"name": "Amos", "role": "QA Engineer", "worker_type": "qa"},
    {"name": "Alex", "role": "Researcher", "worker_type": "research"},
]


class FilesystemSupervisorAdapter(SupervisorAdapterPort):
    def __init__(self, supervisor_system_path: str) -> None:
        self._root = supervisor_system_path
        self._stories_path = os.path.join(supervisor_system_path, "STORIES")

    async def list_stories(self) -> list[SupervisorStory]:
        try:
            entries = await asyncio.to_thread(os.listdir, self._stories_path)
        except FileNotFoundError:
            return []

        stories = []
        for story_id in entries:
            story_dir = os.path.join(self._stories_path, story_id)
            if not await asyncio.to_thread(os.path.isdir, story_dir):
                continue

            content = ""
            story_file = os.path.join(story_dir, "STORY.md")
            try:
                content = await asyncio.to_thread(Path(story_file).read_text, "utf-8")
            except (FileNotFoundError, OSError):
                pass

            tasks = await self.list_tasks_for_story(story_id)
            task_counts: dict[str, int] = {s: 0 for s in TASK_STATES}
            for task in tasks:
                if task.state in task_counts:
                    task_counts[task.state] += 1

            stories.append(SupervisorStory(id=story_id, content=content, task_counts=task_counts))
        return stories

    async def get_story(self, story_id: str) -> SupervisorStory | None:
        story_file = os.path.join(self._stories_path, story_id, "STORY.md")
        try:
            content = await asyncio.to_thread(Path(story_file).read_text, "utf-8")
        except (FileNotFoundError, OSError):
            return None

        tasks = await self.list_tasks_for_story(story_id)
        task_counts: dict[str, int] = {s: 0 for s in TASK_STATES}
        for task in tasks:
            if task.state in task_counts:
                task_counts[task.state] += 1

        return SupervisorStory(id=story_id, content=content, task_counts=task_counts)

    async def list_tasks_for_story(self, story_id: str) -> list[SupervisorTask]:
        tasks_dir = os.path.join(self._stories_path, story_id, "TASKS")
        tasks: list[SupervisorTask] = []

        for state in TASK_STATES:
            state_dir = os.path.join(tasks_dir, state)
            try:
                files = await asyncio.to_thread(os.listdir, state_dir)
            except (FileNotFoundError, OSError):
                continue

            yaml_files = [f for f in files if f.endswith((".yaml", ".yml"))]
            for filename in yaml_files:
                file_path = os.path.join(state_dir, filename)
                task = await self._parse_task_file(file_path, state, story_id)
                tasks.append(task)

        return tasks

    async def get_task(self, story_id: str, task_id: str) -> SupervisorTask | None:
        tasks_dir = os.path.join(self._stories_path, story_id, "TASKS")

        for state in TASK_STATES:
            state_dir = os.path.join(tasks_dir, state)
            try:
                files = await asyncio.to_thread(os.listdir, state_dir)
            except (FileNotFoundError, OSError):
                continue

            for filename in files:
                name_without_ext = filename.rsplit(".", 1)[0] if "." in filename else filename
                if name_without_ext == task_id:
                    file_path = os.path.join(state_dir, filename)
                    return await self._parse_task_file(file_path, state, story_id)

        return None

    async def get_task_results(self, story_id: str, task_id: str) -> TaskResult | None:
        results_dir = os.path.join(self._stories_path, story_id, "RESULTS", task_id)
        try:
            is_dir = await asyncio.to_thread(os.path.isdir, results_dir)
            if not is_dir:
                return None
        except OSError:
            return None

        files = await self._collect_files(results_dir, "")
        return TaskResult(task_id=task_id, files=files)

    async def get_agent_statuses(self) -> list[AgentStatus]:
        supervisor_status, assigned_tasks = await asyncio.gather(
            self._get_supervisor_status(),
            self._get_assigned_tasks(),
        )

        statuses: list[AgentStatus] = []
        for agent in _AGENT_CONFIGS:
            if agent["worker_type"] is None:
                decision = (supervisor_status.get("decision") or "").upper()
                is_working = "ASSIGN" in decision or "CREATE" in decision
                statuses.append(
                    AgentStatus(
                        name=agent["name"],
                        role=agent["role"],
                        status="working" if is_working else "idle",
                        task=supervisor_status.get("decision") if is_working else None,
                    )
                )
            else:
                task = assigned_tasks.get(agent["worker_type"])
                statuses.append(
                    AgentStatus(
                        name=agent["name"],
                        role=agent["role"],
                        status="working" if task else "idle",
                        task=task,
                    )
                )

        return statuses

    async def _get_supervisor_status(self) -> dict:
        tick_path = os.path.join(self._root, "supervisor", "state", "last-tick.md")
        try:
            content = await asyncio.to_thread(Path(tick_path).read_text, "utf-8")
            match = re.search(r"\*\*Decision:\*\*\s*(.+?)(?:\n|$)", content, re.IGNORECASE)
            return {"decision": match.group(1).strip() if match else None}
        except (FileNotFoundError, OSError):
            return {"decision": None}

    async def _get_assigned_tasks(self) -> dict[str, str]:
        assigned: dict[str, str] = {}
        try:
            story_dirs = await asyncio.to_thread(os.listdir, self._stories_path)
        except (FileNotFoundError, OSError):
            return assigned

        for story_id in story_dirs:
            assigned_dir = os.path.join(self._stories_path, story_id, "TASKS", "ASSIGNED")
            try:
                files = await asyncio.to_thread(os.listdir, assigned_dir)
            except (FileNotFoundError, OSError):
                continue

            yaml_files = [f for f in files if f.endswith((".yaml", ".yml"))]
            for filename in yaml_files:
                try:
                    raw = await asyncio.to_thread(
                        Path(os.path.join(assigned_dir, filename)).read_text, "utf-8"
                    )
                    data = yaml.safe_load(raw)
                    if isinstance(data, dict) and data.get("worker_type"):
                        wt = str(data["worker_type"])
                        objective = str(data.get("objective", ""))
                        summary = next(
                            (line.strip() for line in objective.split("\n") if line.strip()),
                            objective,
                        )
                        assigned[wt] = summary
                except Exception:  # noqa: BLE001
                    continue

        return assigned

    async def _parse_task_file(self, file_path: str, state: str, story_id: str) -> SupervisorTask:
        filename = os.path.basename(file_path)
        base_name = filename.rsplit(".", 1)[0] if "." in filename else filename

        try:
            raw = await asyncio.to_thread(Path(file_path).read_text, "utf-8")
            data = yaml.safe_load(raw)

            if not isinstance(data, dict):
                msg = "YAML parsed to non-object value"
                logger.warning("[parseTaskFile] %s: %s", filename, msg)
                return self._error_task(base_name, state, story_id, msg)

            if not data.get("task_id"):
                msg = "Missing required field: task_id"
                logger.warning("[parseTaskFile] %s: %s", filename, msg)
                return self._error_task(base_name, state, story_id, msg)

            return SupervisorTask(
                task_id=str(data["task_id"]),
                objective=str(data.get("objective", "")),
                worker_type=str(data.get("worker_type", "unknown")),
                state=state,
                story_id=story_id,
                inputs=data.get("inputs"),
                constraints=data.get("constraints"),
                output_requirements=data.get("output_requirements"),
            )
        except Exception as err:  # noqa: BLE001
            msg = str(err)
            logger.warning("[parseTaskFile] %s: %s", filename, msg)
            return self._error_task(base_name, state, story_id, msg)

    @staticmethod
    def _error_task(task_id: str, state: str, story_id: str, error: str) -> SupervisorTask:
        return SupervisorTask(
            task_id=task_id or "unknown",
            objective="",
            worker_type="unknown",
            state=state,
            story_id=story_id,
            parse_error=error,
        )

    async def _collect_files(self, base_dir: str, relative_path: str) -> list[ResultFile]:
        dir_path = os.path.join(base_dir, relative_path) if relative_path else base_dir
        try:
            entries = await asyncio.to_thread(os.listdir, dir_path)
        except (FileNotFoundError, OSError):
            return []

        results: list[ResultFile] = []
        for entry_name in entries:
            entry_rel = f"{relative_path}/{entry_name}" if relative_path else entry_name
            entry_full = os.path.join(base_dir, entry_rel)

            if await asyncio.to_thread(os.path.isdir, entry_full):
                nested = await self._collect_files(base_dir, entry_rel)
                results.extend(nested)
            elif await asyncio.to_thread(os.path.isfile, entry_full):
                ext = os.path.splitext(entry_name)[1].lower()
                content = None
                if ext in TEXT_EXTENSIONS:
                    try:
                        content = await asyncio.to_thread(Path(entry_full).read_text, "utf-8")
                    except Exception:  # noqa: BLE001
                        pass
                results.append(ResultFile(name=entry_name, path=entry_rel, content=content))

        return results
