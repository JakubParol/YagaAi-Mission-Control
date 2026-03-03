"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
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
import type { StoryDetail, TaskItem } from "./story-types";

type DialogState =
  | { kind: "loading"; forStoryId: string }
  | { kind: "error"; forStoryId: string; message: string }
  | { kind: "ok"; forStoryId: string; story: StoryDetail; tasks: TaskItem[] };

interface TaskDraft {
  title: string;
  objective: string;
  task_type: string;
  priority: string;
  estimate_points: string;
  due_at: string;
}

interface TaskEditDraft extends TaskDraft {
  status: ItemStatus;
  is_blocked: boolean;
  blocked_reason: string;
}

interface StoryDraft {
  title: string;
  story_type: string;
  description: string;
  priority: string;
  epic_id: string;
  blocked_reason: string;
}

interface EpicOption {
  id: string;
  key: string | null;
  title: string;
}

interface NormalizedStory {
  title: string;
  story_type: string;
  description: string | null;
  priority: number | null;
  epic_id: string | null;
  blocked_reason: string | null;
}

const TASK_TYPE_OPTIONS = ["CODING", "TESTING", "RESEARCH", "DOCS", "OPS"] as const;
const STORY_TYPE_OPTIONS = [
  { value: "USER_STORY", label: "Story" },
  { value: "BUG", label: "Bug" },
  { value: "SPIKE", label: "Spike" },
  { value: "CHORE", label: "Chore" },
] as const;

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

function initialTaskEditDraft(): TaskEditDraft {
  return {
    ...initialTaskDraft(),
    status: "TODO",
    is_blocked: false,
    blocked_reason: "",
  };
}

function toStoryDraft(story: StoryDetail): StoryDraft {
  return {
    title: story.title ?? "",
    story_type: story.story_type ?? "USER_STORY",
    description: story.description ?? "",
    priority: story.priority !== null ? String(story.priority) : "",
    epic_id: story.epic_id ?? "",
    blocked_reason: story.blocked_reason ?? "",
  };
}

function parsePriority(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoryDraft(draft: StoryDraft): NormalizedStory {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const blockedReason = draft.blocked_reason.trim();
  const epicId = draft.epic_id.trim();
  return {
    title,
    story_type: draft.story_type,
    description: description === "" ? null : description,
    priority: parsePriority(draft.priority),
    epic_id: epicId === "" ? null : epicId,
    blocked_reason: blockedReason === "" ? null : blockedReason,
  };
}

function normalizeStory(story: StoryDetail): NormalizedStory {
  return {
    title: story.title.trim(),
    story_type: story.story_type,
    description: story.description?.trim() || null,
    priority: story.priority,
    epic_id: story.epic_id,
    blocked_reason: story.blocked_reason?.trim() || null,
  };
}

function isStoryDirty(draft: StoryDraft, story: StoryDetail): boolean {
  const normalizedDraft = normalizeStoryDraft(draft);
  const normalizedStory = normalizeStory(story);
  return (
    normalizedDraft.title !== normalizedStory.title ||
    normalizedDraft.story_type !== normalizedStory.story_type ||
    normalizedDraft.description !== normalizedStory.description ||
    normalizedDraft.priority !== normalizedStory.priority ||
    normalizedDraft.epic_id !== normalizedStory.epic_id ||
    normalizedDraft.blocked_reason !== normalizedStory.blocked_reason
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    return `${date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
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

function toTaskEditDraft(task: TaskItem): TaskEditDraft {
  return {
    title: task.title,
    objective: task.objective ?? "",
    task_type: task.task_type,
    priority: task.priority !== null ? String(task.priority) : "",
    estimate_points: task.estimate_points !== null ? String(task.estimate_points) : "",
    due_at: toDateInputValue(task.due_at),
    status: task.status,
    is_blocked: task.is_blocked,
    blocked_reason: task.blocked_reason ?? "",
  };
}

function TaskRow({
  task,
  pending,
  onEdit,
  onMarkDone,
  onDelete,
}: {
  task: TaskItem;
  pending: boolean;
  onEdit: (trigger: HTMLButtonElement) => void;
  onMarkDone: () => void;
  onDelete: () => void;
}) {
  const statusStyle = STATUS_STYLE[task.status];

  return (
    <div
      className={cn(
        "grid items-center gap-3 px-3 py-2.5",
        "grid-cols-[72px_minmax(0,1fr)_112px_88px_168px]",
        task.is_blocked && "bg-red-500/5",
      )}
    >
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
        {task.key ?? "—"}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {task.objective && (
          <p className="truncate text-xs text-muted-foreground">{task.objective}</p>
        )}
      </div>

      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          statusStyle.bg,
          statusStyle.text,
        )}
      >
        {STATUS_LABEL[task.status]}
      </span>

      <span className="text-xs text-muted-foreground tabular-nums">
        {task.priority !== null ? `P${task.priority}` : "—"}
      </span>

      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending || task.status === "DONE"}
          onClick={onMarkDone}
        >
          <CheckCircle2 className="size-3" />
          Done
        </Button>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          aria-label="Delete task"
          title="Delete task"
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function TaskForm({
  draft,
  disabled,
  onUpdate,
}: {
  draft: TaskDraft;
  disabled: boolean;
  onUpdate: (field: keyof TaskDraft, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs text-muted-foreground">Title</label>
        <input
          value={draft.title}
          onChange={(event) => onUpdate("title", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs text-muted-foreground">Objective</label>
        <textarea
          value={draft.objective}
          onChange={(event) => onUpdate("objective", event.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Type</label>
        <select
          value={draft.task_type}
          onChange={(event) => onUpdate("task_type", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        >
          {TASK_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Priority</label>
        <input
          type="number"
          min={1}
          max={9}
          value={draft.priority}
          onChange={(event) => onUpdate("priority", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Estimate</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={draft.estimate_points}
          onChange={(event) => onUpdate("estimate_points", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Due date</label>
        <input
          type="date"
          value={draft.due_at}
          onChange={(event) => onUpdate("due_at", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

    </div>
  );
}

function TaskManager({
  tasks,
  isCreating,
  pendingTaskIds,
  error,
  onCreate,
  onPatch,
  onMarkDone,
  onDelete,
}: {
  tasks: TaskItem[];
  isCreating: boolean;
  pendingTaskIds: ReadonlySet<string>;
  error: string | null;
  onCreate: (draft: TaskDraft) => Promise<boolean>;
  onPatch: (taskId: string, patch: TaskPatch) => Promise<boolean>;
  onMarkDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<TaskDraft>(initialTaskDraft());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskEditDraft>(initialTaskEditDraft());
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastEditTriggerRef = useRef<HTMLButtonElement | null>(null);

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingTaskId) ?? null,
    [editingTaskId, tasks],
  );

  const updateCreateDraft = (field: keyof TaskDraft, value: string) => {
    setCreateDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateEditDraft = (field: keyof TaskEditDraft, value: string | boolean) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    queueMicrotask(() => {
      createButtonRef.current?.focus();
    });
  };

  const closeEditDialog = () => {
    setEditingTaskId(null);
    queueMicrotask(() => {
      lastEditTriggerRef.current?.focus();
    });
  };

  const handleCreate = async () => {
    const created = await onCreate(createDraft);
    if (!created) return;
    setCreateDraft(initialTaskDraft());
    closeCreateDialog();
  };

  const handleEditSave = async () => {
    if (!editingTask) return;

    const patch: TaskPatch = {};
    const title = editDraft.title.trim();
    const objective = editDraft.objective.trim() === "" ? null : editDraft.objective.trim();
    const taskType =
      editDraft.task_type.trim() === "" ? editingTask.task_type : editDraft.task_type.trim();
    const priority = parseNumberOrNull(editDraft.priority);
    const estimate = parseNumberOrNull(editDraft.estimate_points);
    const dueAt = editDraft.due_at.trim() === "" ? null : editDraft.due_at.trim();
    const currentDueAt = toDateInputValue(editingTask.due_at);
    const blockedReason = editDraft.blocked_reason.trim();
    const normalizedBlockedReason = editDraft.is_blocked
      ? blockedReason === ""
        ? null
        : blockedReason
      : null;
    const currentBlockedReason = editingTask.blocked_reason?.trim() || null;

    if (title === "") return;
    if (title !== editingTask.title) patch.title = title;
    if (objective !== editingTask.objective) patch.objective = objective;
    if (taskType !== editingTask.task_type) patch.task_type = taskType;
    if (editDraft.status !== editingTask.status) patch.status = editDraft.status;
    if (priority !== editingTask.priority) patch.priority = priority;
    if (estimate !== editingTask.estimate_points) patch.estimate_points = estimate;
    if ((dueAt ?? "") !== currentDueAt) patch.due_at = dueAt;
    if (editDraft.is_blocked !== editingTask.is_blocked) patch.is_blocked = editDraft.is_blocked;
    if (normalizedBlockedReason !== currentBlockedReason) {
      patch.blocked_reason = normalizedBlockedReason;
    }

    if (Object.keys(patch).length === 0) {
      closeEditDialog();
      return;
    }

    const saved = await onPatch(editingTask.id, patch);
    if (saved) closeEditDialog();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Tasks ({tasks.length})</h3>
        <Button
          ref={createButtonRef}
          type="button"
          size="xs"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="size-3" />
          Create task
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-md border border-border/40 bg-card/20">
        {tasks.length === 0 ? (
          <p className="px-3 py-5 text-sm italic text-muted-foreground">No tasks defined for this story.</p>
        ) : (
          <div className="divide-y divide-border/20">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                pending={pendingTaskIds.has(task.id)}
                onEdit={(trigger) => {
                  lastEditTriggerRef.current = trigger;
                  setEditingTaskId(task.id);
                  setEditDraft(toTaskEditDraft(task));
                }}
                onMarkDone={() => onMarkDone(task.id)}
                onDelete={() => onDelete(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setIsCreateOpen(true);
            return;
          }
          closeCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
          </DialogHeader>
          <TaskForm
            draft={createDraft}
            disabled={isCreating}
            onUpdate={updateCreateDraft}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeCreateDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isCreating || createDraft.title.trim() === ""}
              onClick={handleCreate}
            >
              {isCreating && <Loader2 className="size-3 animate-spin" />}
              Create task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingTask !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeEditDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          {editingTask ? (
            <>
              <TaskForm
                draft={editDraft}
                disabled={pendingTaskIds.has(editingTask.id)}
                onUpdate={(field, value) => updateEditDraft(field, value)}
              />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select
                    value={editDraft.status}
                    disabled={pendingTaskIds.has(editingTask.id)}
                    onChange={(event) => updateEditDraft("status", event.target.value as ItemStatus)}
                    className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
                  >
                    <option value="TODO">Todo</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="CODE_REVIEW">Code review</option>
                    <option value="VERIFY">Verify</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="inline-flex h-9 items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editDraft.is_blocked}
                      disabled={pendingTaskIds.has(editingTask.id)}
                      onChange={(event) => updateEditDraft("is_blocked", event.target.checked)}
                      className="size-4 rounded border-border/60 bg-background"
                    />
                    Blocked
                  </label>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Blocked reason</label>
                  <textarea
                    value={editDraft.blocked_reason}
                    disabled={pendingTaskIds.has(editingTask.id) || !editDraft.is_blocked}
                    onChange={(event) => updateEditDraft("blocked_reason", event.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus-ring"
                    placeholder="Leave empty when not blocked."
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeEditDialog}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pendingTaskIds.has(editingTask.id) || editDraft.title.trim() === ""}
                  onClick={handleEditSave}
                >
                  {pendingTaskIds.has(editingTask.id) && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  Save task
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function StoryDetailDialog({
  storyId,
  open = false,
  onOpenChange,
  embedded = false,
  onStoryUpdated,
}: {
  storyId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  embedded?: boolean;
  onStoryUpdated?: () => void;
}) {
  const [state, setState] = useState<DialogState>(() => ({
    kind: "loading",
    forStoryId: storyId ?? "",
  }));
  const [storyDraft, setStoryDraft] = useState<StoryDraft | null>(null);
  const [storyDraftForId, setStoryDraftForId] = useState<string | null>(null);
  const [isSavingStory, setIsSavingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});
  const isActive = embedded ? storyId !== null : open;

  const viewState: DialogState = useMemo(() => {
    if (!isActive || !storyId) return state;
    if (state.forStoryId === storyId) return state;
    return { kind: "loading", forStoryId: storyId };
  }, [isActive, state, storyId]);

  const pendingSet = useMemo(() => new Set(Object.keys(pendingTaskIds)), [pendingTaskIds]);
  const activeStory = viewState.kind === "ok" ? viewState.story : null;
  const hasUnsavedStoryChanges = useMemo(
    () => activeStory !== null && storyDraft !== null && isStoryDirty(storyDraft, activeStory),
    [activeStory, storyDraft],
  );

  useEffect(() => {
    if (!storyId || !isActive) return;

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
    ])
      .then(([storyJson, tasksJson]) => {
        if (cancelled) return;
        const mappedTasks = ((tasksJson.data ?? []) as Record<string, unknown>[]).map(mapTaskFromApi);
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
  }, [storyId, isActive]);

  useEffect(() => {
    if (!activeStory) return;
    if (storyDraftForId === activeStory.id && storyDraft !== null) return;
    setStoryDraft(toStoryDraft(activeStory));
    setStoryDraftForId(activeStory.id);
    setStoryError(null);
  }, [activeStory, storyDraft, storyDraftForId]);

  useEffect(() => {
    if (!activeStory?.project_id) {
      setEpics([]);
      setIsLoadingEpics(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEpics(true);

    fetch(apiUrl(`/v1/planning/epics?project_id=${activeStory.project_id}&limit=100&sort=priority`))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const items = (json.data ?? []) as EpicOption[];
        setEpics(items);
      })
      .catch(() => {
        if (!cancelled) setEpics([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEpics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeStory]);

  useEffect(() => {
    if (!isActive || !hasUnsavedStoryChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedStoryChanges, isActive]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (hasUnsavedStoryChanges) {
        const confirmed = window.confirm(
          "You have unsaved story changes. Discard changes and close?",
        );
        if (!confirmed) return;
      }
      setStoryDraft(null);
      setStoryDraftForId(null);
      setStoryError(null);
      setTaskError(null);
      setPendingTaskIds({});
    }
    onOpenChange?.(nextOpen);
  };

  const updateStoryDraft = (field: keyof StoryDraft, value: string) => {
    setStoryDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
    setStoryError(null);
  };

  const saveStory = async () => {
    if (viewState.kind !== "ok" || !storyDraft || isSavingStory) return;

    const normalized = normalizeStoryDraft(storyDraft);
    if (normalized.title === "") {
      setStoryError("Story title is required.");
      return;
    }

    setStoryError(null);
    setIsSavingStory(true);

    try {
      const response = await fetch(apiUrl(`/v1/planning/stories/${viewState.story.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalized.title,
          story_type: normalized.story_type,
          description: normalized.description,
          priority: normalized.priority,
          epic_id: normalized.epic_id,
          is_blocked: normalized.blocked_reason !== null,
          blocked_reason: normalized.blocked_reason,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }

      const json = await response.json();
      const updatedStory = json.data as StoryDetail;
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          story: updatedStory,
        };
      });
      setStoryDraft(toStoryDraft(updatedStory));
      setStoryDraftForId(updatedStory.id);
      onStoryUpdated?.();
    } catch (error) {
      setStoryError(error instanceof Error ? error.message : "Failed to save story.");
    } finally {
      setIsSavingStory(false);
    }
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
    if (viewState.kind !== "ok") return false;
    const title = draft.title.trim();
    if (title === "") {
      setTaskError("Task title is required.");
      return false;
    }
    if (!viewState.story.project_id) {
      setTaskError("Story has no project context. Cannot create task.");
      return false;
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
      return true;
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: removeTask(prev.tasks, tempId),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to create task.");
      return false;
    } finally {
      setIsCreatingTask(false);
    }
  };

  const patchTask = async (taskId: string, patch: TaskPatch) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return false;

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

    if (!previousTask) return false;

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
      return true;
    } catch (error) {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask),
        };
      });
      setTaskError(error instanceof Error ? error.message : "Failed to update task.");
      return false;
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

  const dialogBody = (
    <>
      {viewState.kind === "loading" && (
        <>
          {embedded ? (
            <h2 className="sr-only">Loading story…</h2>
          ) : (
            <DialogHeader>
              <DialogTitle className="sr-only">Loading story…</DialogTitle>
            </DialogHeader>
          )}
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </>
      )}

      {viewState.kind === "error" && (
        <>
          {embedded ? (
            <h2 className="sr-only">Error</h2>
          ) : (
            <DialogHeader>
              <DialogTitle className="sr-only">Error</DialogTitle>
            </DialogHeader>
          )}
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{viewState.message}</p>
          </div>
        </>
      )}

      {viewState.kind === "ok" && (
        <>
          {storyDraft ? (
            <>
              {embedded ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tracking-wide text-muted-foreground">
                      {viewState.story.key ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[viewState.story.status].bg,
                        STATUS_STYLE[viewState.story.status].text,
                      )}
                    >
                      {STATUS_LABEL[viewState.story.status]}
                    </span>
                  </div>
                  <h2 className="sr-only">{viewState.story.title}</h2>
                </div>
              ) : (
                <DialogHeader className="gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tracking-wide text-muted-foreground">
                      {viewState.story.key ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[viewState.story.status].bg,
                        STATUS_STYLE[viewState.story.status].text,
                      )}
                    >
                      {STATUS_LABEL[viewState.story.status]}
                    </span>
                    <a
                      href={`/planning/stories/${viewState.story.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                      Open in new tab
                    </a>
                  </div>
                  <DialogTitle className="sr-only">{viewState.story.title}</DialogTitle>
                </DialogHeader>
              )}

              <div className="space-y-5">
                {storyError && (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {storyError}
                  </p>
                )}

                <div className="space-y-1">
                  <label htmlFor="story-detail-title" className="text-xs text-muted-foreground">
                    Title
                  </label>
                  <input
                    id="story-detail-title"
                    value={storyDraft.title}
                    onChange={(event) => updateStoryDraft("title", event.target.value)}
                    className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label htmlFor="story-detail-type" className="text-xs text-muted-foreground">
                      Type
                    </label>
                    <select
                      id="story-detail-type"
                      value={storyDraft.story_type}
                      onChange={(event) => updateStoryDraft("story_type", event.target.value)}
                      className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
                    >
                      {STORY_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="story-detail-priority" className="text-xs text-muted-foreground">
                      Priority
                    </label>
                    <input
                      id="story-detail-priority"
                      type="number"
                      min={0}
                      value={storyDraft.priority}
                      onChange={(event) => updateStoryDraft("priority", event.target.value)}
                      className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="story-detail-epic" className="text-xs text-muted-foreground">
                      Epic
                    </label>
                    <select
                      id="story-detail-epic"
                      value={storyDraft.epic_id}
                      disabled={isLoadingEpics}
                      onChange={(event) => updateStoryDraft("epic_id", event.target.value)}
                      className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
                    >
                      <option value="">No epic</option>
                      {epics.map((epic) => (
                        <option key={epic.id} value={epic.id}>
                          {epic.key ? `${epic.key} ${epic.title}` : epic.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="story-detail-description" className="text-xs text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    id="story-detail-description"
                    value={storyDraft.description}
                    onChange={(event) => updateStoryDraft("description", event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus-ring"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="story-detail-blocked-reason" className="text-xs text-muted-foreground">
                    Blocked reason
                  </label>
                  <textarea
                    id="story-detail-blocked-reason"
                    value={storyDraft.blocked_reason}
                    onChange={(event) => updateStoryDraft("blocked_reason", event.target.value)}
                    rows={2}
                    placeholder="Leave empty to mark story as not blocked."
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blocked reason empty when this story is not blocked.
                  </p>
                </div>

                <TaskManager
                  tasks={viewState.tasks}
                  isCreating={isCreatingTask}
                  pendingTaskIds={pendingSet}
                  error={taskError}
                  onCreate={createTask}
                  onPatch={patchTask}
                  onMarkDone={markTaskDone}
                  onDelete={deleteTask}
                />

                <div className="grid grid-cols-1 gap-2 border-t border-border/30 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Created {formatDate(viewState.story.created_at) ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    Updated {formatDateTime(viewState.story.updated_at) ?? "—"}
                  </span>
                </div>
              </div>

              {hasUnsavedStoryChanges && (
                <div className="mt-4 flex justify-end border-t border-border/40 pt-3">
                  <Button type="button" size="sm" onClick={saveStory} disabled={isSavingStory}>
                    {isSavingStory && <Loader2 className="size-3 animate-spin" />}
                    Save story
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="w-full rounded-lg border border-border/40 bg-card/30 p-6">
        {dialogBody}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        {dialogBody}
      </DialogContent>
    </Dialog>
  );
}
