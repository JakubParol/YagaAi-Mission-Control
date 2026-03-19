"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkItemStatus, WorkItemDetail, WorkItemLabel, TaskItemView } from "@/lib/planning/types";
import {
  addOptimisticTask, applyOptimisticTaskPatch, createOptimisticTask,
  removeTask, replaceTask, rollbackTaskPatch, toTaskStatusDonePatch, type TaskPatch,
} from "./task-optimistic";
import { deleteStory } from "@/app/planning/story-actions";
import {
  toStoryDraft, isStoryDirty, parseNumberOrNull,
  type DialogState, type TaskDraft, type StoryDraft, type EpicOption,
} from "./story-detail-view-model";
import {
  fetchStoryAndTasks, fetchAvailableLabels, fetchEpics,
  patchStoryFields, patchStoryStatus, createTaskApi, patchTaskApi, deleteTaskApi,
  attachLabelApi, detachLabelApi,
} from "./story-detail-actions";

/** Surface-agnostic workspace view state. */
export type WorkspaceViewState =
  | { kind: "loading"; forWorkItemId: string }
  | { kind: "error"; forWorkItemId: string; message: string }
  | { kind: "ok"; forWorkItemId: string; workItem: WorkItemDetail; tasks: TaskItemView[] };

export interface UseWorkItemWorkspaceParams {
  workItemId: string | null;
  isActive: boolean;
  initialLabels?: WorkItemLabel[];
  onWorkItemUpdated?: () => void;
  /** Called when user closes without deleting (discard, normal close). */
  onRequestClose?: () => void;
  /** Called after successful deletion. Falls back to onRequestClose if not set. */
  onWorkItemDeleted?: () => void;
}

export function useWorkItemWorkspaceState(p: UseWorkItemWorkspaceParams) {
  const [state, setState] = useState<DialogState>(() => ({ kind: "loading", forStoryId: p.workItemId ?? "" }));
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [draftForId, setDraftForId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workItemError, setWorkItemError] = useState<string | null>(null);
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});
  const [labels, setLabels] = useState<WorkItemLabel[]>([]);
  const [labelsForId, setLabelsForId] = useState<string | null>(null);
  const [availableLabels, setAvailableLabels] = useState<WorkItemLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [pendingLabelIds, setPendingLabelIds] = useState<Record<string, true>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const viewState: WorkspaceViewState = useMemo(() => {
    if (!p.isActive || !p.workItemId) return { kind: "loading", forWorkItemId: p.workItemId ?? "" };
    if (state.forStoryId === p.workItemId) return mapDialogState(state);
    return { kind: "loading", forWorkItemId: p.workItemId };
  }, [p.isActive, state, p.workItemId]);

  const pendingSet = useMemo(() => new Set(Object.keys(pendingTaskIds)), [pendingTaskIds]);
  const pendingLabelSet = useMemo(() => new Set(Object.keys(pendingLabelIds)), [pendingLabelIds]);
  const activeWorkItem = viewState.kind === "ok" ? viewState.workItem : null;
  const hasUnsavedChanges = useMemo(
    () => activeWorkItem !== null && draft !== null && isStoryDirty(draft, activeWorkItem),
    [activeWorkItem, draft],
  );

  useEffect(() => {
    if (!p.workItemId || !p.isActive || labelsForId === p.workItemId) return;
    setLabels(p.initialLabels ?? []); setLabelsForId(p.workItemId);
    setSelectedLabelId(""); setLabelError(null); setPendingLabelIds({});
  }, [p.initialLabels, p.isActive, p.workItemId, labelsForId]);

  useEffect(() => {
    if (!p.workItemId || !p.isActive) return;
    let cancelled = false;
    fetchStoryAndTasks(p.workItemId)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ok", forStoryId: p.workItemId!, story: r.story, tasks: r.tasks });
        if (r.labels.length > 0) { setLabels(r.labels); setLabelsForId(p.workItemId!); }
      })
      .catch((err) => { if (!cancelled) setState({ kind: "error", forStoryId: p.workItemId!, message: String(err) }); });
    return () => { cancelled = true; };
  }, [p.workItemId, p.isActive]);

  useEffect(() => {
    if (!activeWorkItem) return;
    if (draftForId === activeWorkItem.id && draft !== null) return;
    setDraft(toStoryDraft(activeWorkItem)); setDraftForId(activeWorkItem.id); setWorkItemError(null);
  }, [activeWorkItem, draft, draftForId]);

  useEffect(() => {
    if (!activeWorkItem?.project_id) { setEpics([]); setIsLoadingEpics(false); return; }
    let cancelled = false; setIsLoadingEpics(true);
    fetchEpics(activeWorkItem.project_id)
      .then((items) => { if (!cancelled) setEpics(items); })
      .catch(() => { if (!cancelled) setEpics([]); })
      .finally(() => { if (!cancelled) setIsLoadingEpics(false); });
    return () => { cancelled = true; };
  }, [activeWorkItem]);

  useEffect(() => {
    if (!p.isActive || !p.workItemId || !activeWorkItem?.project_id) {
      setAvailableLabels([]); setIsLoadingLabels(false); return;
    }
    let cancelled = false; setIsLoadingLabels(true);
    fetchAvailableLabels(activeWorkItem.project_id)
      .then((all) => {
        if (cancelled) return;
        setAvailableLabels(all);
        if (activeWorkItem.labels) setLabels(activeWorkItem.labels);
      })
      .catch(() => { if (!cancelled) setAvailableLabels([]); })
      .finally(() => { if (!cancelled) setIsLoadingLabels(false); });
    return () => { cancelled = true; };
  }, [activeWorkItem, p.isActive, p.workItemId]);

  useEffect(() => {
    if (!selectedLabelId) return;
    if (labels.some((l) => l.id === selectedLabelId)) { setSelectedLabelId(""); return; }
    if (!availableLabels.some((l) => l.id === selectedLabelId)) setSelectedLabelId("");
  }, [availableLabels, selectedLabelId, labels]);

  useEffect(() => {
    if (!p.isActive || !hasUnsavedChanges) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { window.removeEventListener("beforeunload", h); };
  }, [hasUnsavedChanges, p.isActive]);

  const toggle = (map: Record<string, true>, id: string, on: boolean) => {
    if (on) return { ...map, [id]: true as const };
    const next = { ...map }; delete next[id]; return next;
  };

  const resetState = () => {
    setDraft(null); setDraftForId(null); setWorkItemError(null); setTaskError(null);
    setPendingTaskIds({}); setLabels([]); setLabelsForId(null); setAvailableLabels([]);
    setSelectedLabelId(""); setLabelError(null); setPendingLabelIds({});
  };

  const discardAndClose = () => { resetState(); p.onRequestClose?.(); };

  const cancelChanges = () => {
    if (viewState.kind !== "ok") return;
    setDraft(toStoryDraft(viewState.workItem)); setWorkItemError(null);
  };

  const updateDraft = (field: keyof StoryDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev)); setWorkItemError(null);
  };

  const save = async () => {
    if (viewState.kind !== "ok" || !draft || isSaving) return;
    if (draft.title.trim() === "") { setWorkItemError("Title is required."); return; }
    setWorkItemError(null); setIsSaving(true);
    try {
      const u = await patchStoryFields(viewState.workItem.id, draft);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, story: u }));
      setDraft(toStoryDraft(u)); setDraftForId(u.id); p.onWorkItemUpdated?.();
    } catch (e) { setWorkItemError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setIsSaving(false); }
  };

  const changeStatus = async (workItemId: string, status: WorkItemStatus) => {
    if (viewState.kind !== "ok" || workItemId !== viewState.workItem.id || isSaving) return;
    if (viewState.workItem.status === status) return;
    setWorkItemError(null); setIsSaving(true);
    try {
      const u = await patchStoryStatus(workItemId, status);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, story: { ...prev.story, ...u } }));
      p.onWorkItemUpdated?.();
    } catch (e) { setWorkItemError(e instanceof Error ? e.message : "Failed to update status."); }
    finally { setIsSaving(false); }
  };

  const deleteWorkItem = async (workItemId: string) => {
    if (isDeleting) return;
    setWorkItemError(null); setIsDeleting(true);
    try {
      await deleteStory(workItemId); p.onWorkItemUpdated?.(); resetState();
      (p.onWorkItemDeleted ?? p.onRequestClose)?.();
    } catch (e) { setWorkItemError(e instanceof Error ? e.message : "Failed to delete."); }
    finally { setIsDeleting(false); }
  };

  const attachLabel = async () => {
    if (viewState.kind !== "ok" || selectedLabelId.trim() === "" || pendingLabelSet.has(selectedLabelId)) return;
    const nl = availableLabels.find((l) => l.id === selectedLabelId);
    if (!nl) { setLabelError("Selected label is unavailable."); return; }
    if (labels.some((l) => l.id === selectedLabelId)) { setLabelError("Label is already attached."); return; }
    const prev = labels; setLabelError(null);
    setPendingLabelIds((m) => toggle(m, selectedLabelId, true));
    setLabels((arr) => [...arr, nl].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedLabelId("");
    try { await attachLabelApi(viewState.workItem.id, nl.id); p.onWorkItemUpdated?.(); }
    catch (e) { setLabels(prev); setLabelError(e instanceof Error ? `Failed to attach label: ${e.message}` : "Failed to attach label."); }
    finally { setPendingLabelIds((m) => toggle(m, nl.id, false)); }
  };

  const detachLabel = async (labelId: string) => {
    if (viewState.kind !== "ok" || pendingLabelSet.has(labelId)) return;
    const prev = labels; const lbl = prev.find((i) => i.id === labelId);
    if (!lbl) return;
    setLabelError(null); setPendingLabelIds((m) => toggle(m, labelId, true));
    setLabels((arr) => arr.filter((i) => i.id !== labelId));
    try { await detachLabelApi(viewState.workItem.id, labelId); p.onWorkItemUpdated?.(); }
    catch (e) { setLabels(prev); setLabelError(e instanceof Error ? `Failed to detach "${lbl.name}": ${e.message}` : `Failed to detach "${lbl.name}".`); }
    finally { setPendingLabelIds((m) => toggle(m, labelId, false)); }
  };

  const createTask = async (taskDraft: TaskDraft): Promise<boolean> => {
    if (viewState.kind !== "ok") return false;
    const title = taskDraft.title.trim();
    if (title === "") { setTaskError("Task title is required."); return false; }
    if (!viewState.workItem.project_id) { setTaskError("Work item has no project context."); return false; }
    setTaskError(null); setIsCreatingTask(true);
    const tempId = `temp-${Date.now()}`;
    const opt = createOptimisticTask({
      storyId: viewState.workItem.id, title,
      summary: taskDraft.summary.trim() === "" ? null : taskDraft.summary.trim(),
      sub_type: taskDraft.sub_type.trim() === "" ? "TASK" : taskDraft.sub_type.trim(),
      priority: parseNumberOrNull(taskDraft.priority), estimate_points: parseNumberOrNull(taskDraft.estimate_points),
      due_at: taskDraft.due_at.trim() === "" ? null : taskDraft.due_at.trim(),
    }, tempId);
    setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: addOptimisticTask(prev.tasks, opt) }));
    try {
      const c = await createTaskApi(viewState.workItem.project_id, viewState.workItem.id, taskDraft);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: replaceTask(prev.tasks, tempId, c) }));
      p.onWorkItemUpdated?.(); return true;
    } catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: removeTask(prev.tasks, tempId) }));
      setTaskError(e instanceof Error ? e.message : "Failed to create task."); return false;
    } finally { setIsCreatingTask(false); }
  };

  const patchTask = async (taskId: string, patch: TaskPatch): Promise<boolean> => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return false;
    let previousTask: TaskItemView | null = null;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const r = applyOptimisticTaskPatch(prev.tasks, taskId, patch);
      previousTask = r.previousTask; return { ...prev, tasks: r.nextTasks };
    });
    if (!previousTask) return false;
    setTaskError(null); setPendingTaskIds((m) => toggle(m, taskId, true));
    try {
      const u = await patchTaskApi(taskId, patch);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: replaceTask(prev.tasks, taskId, u) }));
      p.onWorkItemUpdated?.(); return true;
    } catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask) }));
      setTaskError(e instanceof Error ? e.message : "Failed to update task."); return false;
    } finally { setPendingTaskIds((m) => toggle(m, taskId, false)); }
  };

  const deleteTask = async (taskId: string) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;
    const prevTasks = viewState.tasks;
    setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: removeTask(prev.tasks, taskId) }));
    setTaskError(null); setPendingTaskIds((m) => toggle(m, taskId, true));
    try { await deleteTaskApi(taskId); p.onWorkItemUpdated?.(); }
    catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: prevTasks }));
      setTaskError(e instanceof Error ? e.message : "Failed to delete task.");
    } finally { setPendingTaskIds((m) => toggle(m, taskId, false)); }
  };

  const markTaskDone = async (taskId: string) => { await patchTask(taskId, toTaskStatusDonePatch()); };

  return {
    viewState, workItemDraft: draft, workItemError, epics, isLoadingEpics, isSaving, isDeleting,
    isCreatingTask, taskError, pendingTaskIds: pendingSet, labels, availableLabels, selectedLabelId,
    isLoadingLabels, pendingLabelIds: pendingLabelSet, labelError, hasUnsavedChanges, showDiscardConfirm,
    setShowDiscardConfirm, setSelectedLabelId, discardAndClose, cancelChanges, updateDraft, save,
    changeStatus, deleteWorkItem, attachLabel, detachLabel, createTask, patchTask, deleteTask, markTaskDone,
  };
}

// Maps legacy DialogState (forStoryId/story) → WorkspaceViewState (forWorkItemId/workItem)
function mapDialogState(ds: DialogState): WorkspaceViewState {
  switch (ds.kind) {
    case "loading": return { kind: "loading", forWorkItemId: ds.forStoryId };
    case "error": return { kind: "error", forWorkItemId: ds.forStoryId, message: ds.message };
    case "ok": return { kind: "ok", forWorkItemId: ds.forStoryId, workItem: ds.story, tasks: ds.tasks };
  }
}
