"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import type { ItemStatus, TaskItem } from "@/lib/planning/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TaskPatch } from "./task-optimistic";
import {
  STATUS_OPTIONS,
  initialTaskDraft,
  initialTaskEditDraft,
  toTaskEditDraft,
  toDateInputValue,
  parseNumberOrNull,
  type TaskDraft,
  type TaskEditDraft,
} from "./story-detail-view-model";
import { TaskRow, TaskForm } from "./story-detail-task-form";

// ── TaskManager ─────────────────────────────────────────────────────────────

export interface TaskManagerProps {
  tasks: TaskItem[];
  isCreating: boolean;
  pendingTaskIds: ReadonlySet<string>;
  error: string | null;
  onCreate: (draft: TaskDraft) => Promise<boolean>;
  onPatch: (taskId: string, patch: TaskPatch) => Promise<boolean>;
  onMarkDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export function TaskManager({
  tasks,
  isCreating,
  pendingTaskIds,
  error,
  onCreate,
  onPatch,
  onMarkDone,
  onDelete,
}: TaskManagerProps) {
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
    queueMicrotask(() => { createButtonRef.current?.focus(); });
  };

  const closeEditDialog = () => {
    setEditingTaskId(null);
    queueMicrotask(() => { lastEditTriggerRef.current?.focus(); });
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
      ? blockedReason === "" ? null : blockedReason
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

    if (Object.keys(patch).length === 0) { closeEditDialog(); return; }
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
          <p className="px-3 py-5 text-sm italic text-muted-foreground">
            No tasks defined for this story.
          </p>
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

      {/* Create task dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) { setIsCreateOpen(true); return; }
          closeCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
          <TaskForm draft={createDraft} disabled={isCreating} onUpdate={updateCreateDraft} />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeCreateDialog}>Cancel</Button>
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

      {/* Edit task dialog */}
      <Dialog
        open={editingTask !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) closeEditDialog(); }}
      >
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Edit task</DialogTitle></DialogHeader>
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
                    onChange={(event) =>
                      updateEditDraft("status", event.target.value as ItemStatus)
                    }
                    className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
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
                <Button type="button" variant="outline" onClick={closeEditDialog}>Cancel</Button>
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
