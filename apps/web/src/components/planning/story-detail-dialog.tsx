"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUS_STYLE } from "./story-card";
import {
  addOptimisticTask,
  applyOptimisticTaskPatch,
  createOptimisticTask,
  removeTask,
  replaceTask,
  rollbackTaskPatch,
  toTaskStatusDonePatch,
  type TaskPatch,
} from "./task-optimistic";
import { StoryView, type StoryDetail, type TaskItem } from "./story-view";
import { StoryForm } from "./story-form";

type DialogState =
  | { kind: "loading"; forStoryId: string }
  | { kind: "error"; forStoryId: string; message: string }
  | { kind: "ok"; forStoryId: string; story: StoryDetail; tasks: TaskItem[] };

interface AgentOption {
  id: string;
  name: string;
  openclaw_key: string;
}

interface TaskDraft {
  title: string;
  objective: string;
  task_type: string;
  priority: string;
  estimate_points: string;
  due_at: string;
}

const TASK_STATUS_OPTIONS: ItemStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
];

const TASK_TYPE_OPTIONS = ["CODING", "TESTING", "RESEARCH", "DOCS", "OPS"] as const;

function initialTaskDraft(): TaskDraft {
  return {
    title: "",
    objective: "",
    task_type: "CODING",
    priority: "",
    estimate_points: "",
    due_at: "",
  };
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.length >= 10 ? iso.slice(0, 10) : "";
  }
  return date.toISOString().slice(0, 10);
}

function parseNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function parseApiMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { message?: string };
      detail?: Array<{ msg?: string }>;
    };
    if (json.error?.message) return json.error.message;
    if (Array.isArray(json.detail) && json.detail[0]?.msg) return json.detail[0].msg;
  } catch {
    // ignore and fallback below
  }
  return `Request failed. HTTP ${response.status}.`;
}

function mapTaskFromApi(raw: Record<string, unknown>): TaskItem {
  return {
    id: String(raw.id),
    key: raw.key ? String(raw.key) : null,
    title: String(raw.title ?? ""),
    objective: raw.objective ? String(raw.objective) : null,
    task_type: String(raw.task_type ?? "TASK"),
    status: (raw.status as ItemStatus) ?? "TODO",
    priority: typeof raw.priority === "number" ? raw.priority : null,
    is_blocked: Boolean(raw.is_blocked),
    blocked_reason: raw.blocked_reason ? String(raw.blocked_reason) : null,
    estimate_points: typeof raw.estimate_points === "number" ? raw.estimate_points : null,
    due_at: raw.due_at ? String(raw.due_at) : null,
    current_assignee_agent_id: raw.current_assignee_agent_id
      ? String(raw.current_assignee_agent_id)
      : null,
  };
}

function TaskEditorRow({
  task,
  pending,
  agents,
  onPatch,
  onMarkDone,
  onDelete,
  onAssign,
  onUnassign,
}: {
  task: TaskItem;
  pending: boolean;
  agents: AgentOption[];
  onPatch: (taskId: string, patch: TaskPatch) => void;
  onMarkDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAssign: (taskId: string, agentId: string) => void;
  onUnassign: (taskId: string, agentId: string) => void;
}) {
  const [assigneeDraft, setAssigneeDraft] = useState(
    () => task.current_assignee_agent_id ?? "",
  );

  const handleFieldBlur = (
    field: "title" | "objective" | "task_type" | "priority" | "estimate_points" | "due_at" | "blocked_reason",
    value: string,
  ) => {
    if (pending) return;

    if (field === "title") {
      const nextTitle = value.trim();
      if (nextTitle !== "" && nextTitle !== task.title) onPatch(task.id, { title: nextTitle });
      return;
    }

    if (field === "objective") {
      const nextObjective = value.trim() === "" ? null : value.trim();
      if (nextObjective !== task.objective) onPatch(task.id, { objective: nextObjective });
      return;
    }

    if (field === "task_type") {
      const nextType = value.trim() === "" ? task.task_type : value.trim();
      if (nextType !== task.task_type) onPatch(task.id, { task_type: nextType });
      return;
    }

    if (field === "priority") {
      const nextPriority = parseNumberOrNull(value);
      if (nextPriority !== task.priority) onPatch(task.id, { priority: nextPriority });
      return;
    }

    if (field === "estimate_points") {
      const nextEstimate = parseNumberOrNull(value);
      if (nextEstimate !== task.estimate_points) {
        onPatch(task.id, { estimate_points: nextEstimate });
      }
      return;
    }

    if (field === "due_at") {
      const nextDueAt = value.trim() === "" ? null : value.trim();
      const currentDueAt = toDateInputValue(task.due_at);
      if ((nextDueAt ?? "") !== currentDueAt) onPatch(task.id, { due_at: nextDueAt });
      return;
    }

    const nextReason = value.trim() === "" ? null : value.trim();
    if (nextReason !== task.blocked_reason) onPatch(task.id, { blocked_reason: nextReason });
  };

  const statusStyle = STATUS_STYLE[task.status];

  return (
    <div
      className={cn(
        "rounded-md border border-border/40 bg-muted/20 p-3",
        task.is_blocked && "border-red-500/30 bg-red-500/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {task.key ?? "—"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            statusStyle.bg,
            statusStyle.text,
          )}
        >
          {STATUS_LABEL[task.status]}
        </span>
        {task.current_assignee_agent_id && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <UserRound className="size-3" />
            {task.current_assignee_agent_id}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">Title</label>
          <input
            defaultValue={task.title}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("title", event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">Objective</label>
          <textarea
            defaultValue={task.objective ?? ""}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("objective", event.target.value)}
            rows={2}
            className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Type</label>
          <input
            defaultValue={task.task_type}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("task_type", event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Status</label>
          <select
            value={task.status}
            disabled={pending}
            onChange={(event) => onPatch(task.id, { status: event.target.value as ItemStatus })}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          >
            {TASK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Priority</label>
          <input
            type="number"
            min={1}
            max={9}
            defaultValue={task.priority ?? ""}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("priority", event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Estimate</label>
          <input
            type="number"
            min={0}
            step={0.5}
            defaultValue={task.estimate_points ?? ""}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("estimate_points", event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Due date</label>
          <input
            type="date"
            defaultValue={toDateInputValue(task.due_at)}
            disabled={pending}
            onBlur={(event) => handleFieldBlur("due_at", event.target.value)}
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={task.is_blocked}
              disabled={pending}
              onChange={(event) => {
                const checked = event.target.checked;
                onPatch(task.id, {
                  is_blocked: checked,
                  blocked_reason: checked ? task.blocked_reason : null,
                });
              }}
              className="size-3.5 rounded border-border/60 bg-background"
            />
            Blocked
          </label>
          <input
            defaultValue={task.blocked_reason ?? ""}
            disabled={pending || !task.is_blocked}
            onBlur={(event) => handleFieldBlur("blocked_reason", event.target.value)}
            placeholder="Blocked reason"
            className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">Assignee</label>
          <div className="flex items-center gap-2">
            <select
              value={assigneeDraft}
              disabled={pending}
              onChange={(event) => setAssigneeDraft(event.target.value)}
              className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.openclaw_key})
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={pending || assigneeDraft === ""}
              onClick={() => {
                if (assigneeDraft !== "") onAssign(task.id, assigneeDraft);
              }}
            >
              Assign
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={pending || !task.current_assignee_agent_id}
              onClick={() => {
                if (task.current_assignee_agent_id) {
                  onUnassign(task.id, task.current_assignee_agent_id);
                }
              }}
            >
              Unassign
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending || task.status === "DONE"}
          onClick={() => onMarkDone(task.id)}
        >
          <CheckCircle2 className="size-3" />
          Mark done
        </Button>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          disabled={pending}
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="size-3" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function TaskManager({
  tasks,
  agents,
  isCreating,
  pendingTaskIds,
  error,
  onCreate,
  onPatch,
  onMarkDone,
  onDelete,
  onAssign,
  onUnassign,
}: {
  tasks: TaskItem[];
  agents: AgentOption[];
  isCreating: boolean;
  pendingTaskIds: ReadonlySet<string>;
  error: string | null;
  onCreate: (draft: TaskDraft) => void;
  onPatch: (taskId: string, patch: TaskPatch) => void;
  onMarkDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onAssign: (taskId: string, agentId: string) => void;
  onUnassign: (taskId: string, agentId: string) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(initialTaskDraft());

  const updateDraft = (field: keyof TaskDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = () => {
    onCreate(draft);
    setDraft(initialTaskDraft());
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Tasks ({tasks.length})</h3>

      {error && (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mb-4 rounded-md border border-border/40 bg-card/30 p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Create task
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="Task title"
            disabled={isCreating}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring sm:col-span-2"
          />
          <textarea
            value={draft.objective}
            onChange={(event) => updateDraft("objective", event.target.value)}
            placeholder="Objective"
            disabled={isCreating}
            rows={2}
            className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs focus-ring sm:col-span-2"
          />
          <select
            value={draft.task_type}
            onChange={(event) => updateDraft("task_type", event.target.value)}
            disabled={isCreating}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          >
            {TASK_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={9}
            value={draft.priority}
            onChange={(event) => updateDraft("priority", event.target.value)}
            placeholder="Priority"
            disabled={isCreating}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.estimate_points}
            onChange={(event) => updateDraft("estimate_points", event.target.value)}
            placeholder="Estimate"
            disabled={isCreating}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
          <input
            type="date"
            value={draft.due_at}
            onChange={(event) => updateDraft("due_at", event.target.value)}
            disabled={isCreating}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs focus-ring"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="xs"
            disabled={isCreating || draft.title.trim() === ""}
            onClick={handleCreate}
          >
            {isCreating ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Create task
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="py-2 text-sm italic text-muted-foreground">No tasks defined for this story.</p>
        ) : (
          tasks.map((task) => (
            <TaskEditorRow
              key={`${task.id}:${task.title}:${task.status}:${task.priority ?? ""}:${task.estimate_points ?? ""}:${task.due_at ?? ""}:${task.is_blocked ? "1" : "0"}:${task.blocked_reason ?? ""}:${task.task_type}:${task.current_assignee_agent_id ?? "none"}`}
              task={task}
              pending={pendingTaskIds.has(task.id)}
              agents={agents}
              onPatch={onPatch}
              onMarkDone={onMarkDone}
              onDelete={onDelete}
              onAssign={onAssign}
              onUnassign={onUnassign}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function StoryDetailDialog({
  storyId,
  open,
  onOpenChange,
  onStoryUpdated,
}: {
  storyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoryUpdated?: () => void;
}) {
  const [state, setState] = useState<DialogState>(() => ({
    kind: "loading",
    forStoryId: storyId ?? "",
  }));
  const [isEditing, setIsEditing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});

  const viewState: DialogState =
    open && storyId
      ? state.forStoryId === storyId
        ? state
        : { kind: "loading", forStoryId: storyId }
      : state;

  const pendingSet = useMemo(() => new Set(Object.keys(pendingTaskIds)), [pendingTaskIds]);

  useEffect(() => {
    if (!storyId || !open) return;

    let cancelled = false;

    Promise.all([
      fetch(apiUrl(`/v1/planning/stories/${storyId}`)).then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      }),
      fetch(apiUrl(`/v1/planning/tasks?story_id=${storyId}&sort=priority`)).then((res) => {
        if (!res.ok) throw new Error(`Tasks API error: ${res.status}`);
        return res.json();
      }),
      fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name"))
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] })),
    ])
      .then(([storyJson, tasksJson, agentsJson]) => {
        if (cancelled) return;
        const mappedTasks = ((tasksJson.data ?? []) as Record<string, unknown>[]).map(mapTaskFromApi);
        const mappedAgents = ((agentsJson.data ?? []) as Record<string, unknown>[]).map((raw) => ({
          id: String(raw.id),
          name: String(raw.name ?? "Unnamed"),
          openclaw_key: String(raw.openclaw_key ?? "unknown"),
        }));
        setAgents(mappedAgents);
        setState({
          kind: "ok",
          forStoryId: storyId,
          story: storyJson.data,
          tasks: mappedTasks,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ kind: "error", forStoryId: storyId, message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storyId, open, reloadToken]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsEditing(false);
      setTaskError(null);
      setPendingTaskIds({});
    }
    onOpenChange(nextOpen);
  };

  const withTaskPending = (taskId: string, pending: boolean) => {
    setPendingTaskIds((prev) => {
      if (pending) return { ...prev, [taskId]: true };
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const createTask = async (draft: TaskDraft) => {
    if (viewState.kind !== "ok") return;
    const title = draft.title.trim();
    if (title === "") {
      setTaskError("Task title is required.");
      return;
    }
    if (!viewState.story.project_id) {
      setTaskError("Story has no project context. Cannot create task.");
      return;
    }

    setTaskError(null);
    setIsCreatingTask(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticTask = createOptimisticTask(
      {
        storyId: viewState.story.id,
        title,
        objective: draft.objective.trim() === "" ? null : draft.objective.trim(),
        task_type: draft.task_type.trim() === "" ? "TASK" : draft.task_type.trim(),
        priority: parseNumberOrNull(draft.priority),
        estimate_points: parseNumberOrNull(draft.estimate_points),
        due_at: draft.due_at.trim() === "" ? null : draft.due_at.trim(),
      },
      tempId,
    );

    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      return {
        ...prev,
        tasks: addOptimisticTask(prev.tasks, optimisticTask),
      };
    });

    try {
      const response = await fetch(apiUrl("/v1/planning/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: viewState.story.project_id,
          story_id: viewState.story.id,
          title,
          objective: draft.objective.trim() === "" ? null : draft.objective.trim(),
          task_type: draft.task_type.trim() === "" ? "TASK" : draft.task_type.trim(),
          priority: parseNumberOrNull(draft.priority),
          estimate_points: parseNumberOrNull(draft.estimate_points),
          due_at: draft.due_at.trim() === "" ? null : draft.due_at.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }

      const json = await response.json();
      const created = mapTaskFromApi(json.data as Record<string, unknown>);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: replaceTask(prev.tasks, tempId, created),
        };
      });
      onStoryUpdated?.();
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: removeTask(prev.tasks, tempId),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to create task.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const patchTask = async (taskId: string, patch: TaskPatch) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;

    let previousTask: TaskItem | null = null;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const result = applyOptimisticTaskPatch(prev.tasks, taskId, patch);
      previousTask = result.previousTask;
      return {
        ...prev,
        tasks: result.nextTasks,
      };
    });

    if (!previousTask) return;

    setTaskError(null);
    withTaskPending(taskId, true);

    try {
      const apiPatch = { ...patch } as Record<string, unknown>;
      delete apiPatch.current_assignee_agent_id;

      const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPatch),
      });

      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }

      const json = await response.json();
      const updated = mapTaskFromApi(json.data as Record<string, unknown>);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: replaceTask(prev.tasks, taskId, updated),
        };
      });
      onStoryUpdated?.();
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to update task.");
    } finally {
      withTaskPending(taskId, false);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;

    const previousTasks = viewState.tasks;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      return {
        ...prev,
        tasks: removeTask(prev.tasks, taskId),
      };
    });

    setTaskError(null);
    withTaskPending(taskId, true);

    try {
      const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }
      onStoryUpdated?.();
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: previousTasks,
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to delete task.");
    } finally {
      withTaskPending(taskId, false);
    }
  };

  const markTaskDone = async (taskId: string) => {
    await patchTask(taskId, toTaskStatusDonePatch());
  };

  const syncTaskFromServer = async (taskId: string) => {
    const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}`));
    if (!response.ok) throw new Error(await parseApiMessage(response));
    const json = await response.json();
    const synced = mapTaskFromApi(json.data as Record<string, unknown>);
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      return {
        ...prev,
        tasks: replaceTask(prev.tasks, taskId, synced),
      };
    });
  };

  const assignTask = async (taskId: string, agentId: string) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;
    let previousTask: TaskItem | null = null;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const result = applyOptimisticTaskPatch(prev.tasks, taskId, {
        current_assignee_agent_id: agentId,
      });
      previousTask = result.previousTask;
      return {
        ...prev,
        tasks: result.nextTasks,
      };
    });

    withTaskPending(taskId, true);
    try {
      const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}/assignments`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }
      await syncTaskFromServer(taskId);
      onStoryUpdated?.();
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to assign agent.");
    } finally {
      withTaskPending(taskId, false);
    }
  };

  const unassignTask = async (taskId: string, agentId: string) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;
    let previousTask: TaskItem | null = null;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const result = applyOptimisticTaskPatch(prev.tasks, taskId, {
        current_assignee_agent_id: null,
      });
      previousTask = result.previousTask;
      return {
        ...prev,
        tasks: result.nextTasks,
      };
    });

    withTaskPending(taskId, true);
    try {
      const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}/assignments/${agentId}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }
      await syncTaskFromServer(taskId);
      onStoryUpdated?.();
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to unassign agent.");
    } finally {
      withTaskPending(taskId, false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        {viewState.kind === "loading" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Loading story…</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {viewState.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Error</DialogTitle>
            </DialogHeader>
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{viewState.message}</p>
            </div>
          </>
        )}

        {viewState.kind === "ok" && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{viewState.story.title}</DialogTitle>
            </DialogHeader>
            {isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Edit story</h2>
                </div>
                <StoryForm
                  mode="edit"
                  projectId={viewState.story.project_id ?? ""}
                  storyId={viewState.story.id}
                  initialValues={{
                    title: viewState.story.title,
                    story_type: viewState.story.story_type,
                    description: viewState.story.description ?? "",
                    priority:
                      viewState.story.priority !== null
                        ? String(viewState.story.priority)
                        : "",
                    epic_id: viewState.story.epic_id ?? "",
                    blocked_reason: viewState.story.blocked_reason ?? "",
                  }}
                  submitLabel="Save story"
                  onSaved={() => {
                    setIsEditing(false);
                    setReloadToken((prev) => prev + 1);
                    onStoryUpdated?.();
                  }}
                  onCancel={() => setIsEditing(false)}
                />
              </div>
            ) : (
              <StoryView
                story={viewState.story}
                tasks={viewState.tasks}
                headerActions={
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <a
                      href={`/planning/stories/${viewState.story.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                      Open in new tab
                    </a>
                  </div>
                }
                tasksSection={
                  <TaskManager
                    tasks={viewState.tasks}
                    agents={agents}
                    isCreating={isCreatingTask}
                    pendingTaskIds={pendingSet}
                    error={taskError}
                    onCreate={createTask}
                    onPatch={patchTask}
                    onMarkDone={markTaskDone}
                    onDelete={deleteTask}
                    onAssign={assignTask}
                    onUnassign={unassignTask}
                  />
                }
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
