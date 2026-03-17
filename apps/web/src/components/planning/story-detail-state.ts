"use client";

import { useEffect, useMemo, useState } from "react";
import type { ItemStatus } from "@/lib/planning/types";
import type { StoryLabel } from "./story-label-chips";
import {
  addOptimisticTask, applyOptimisticTaskPatch, createOptimisticTask,
  removeTask, replaceTask, rollbackTaskPatch, toTaskStatusDonePatch, type TaskPatch,
} from "./task-optimistic";
import type { TaskItem } from "./story-types";
import { deleteStory } from "@/app/planning/story-actions";
import {
  toStoryDraft, isStoryDirty, parseNumberOrNull,
  type DialogState, type TaskDraft, type StoryDraft, type EpicOption,
} from "./story-detail-view-model";
import {
  fetchStoryAndTasks, fetchStoryLabelsFromBacklogs, fetchAvailableLabels, fetchEpics,
  patchStoryFields, patchStoryStatus, createTaskApi, patchTaskApi, deleteTaskApi,
  attachLabelApi, detachLabelApi,
} from "./story-detail-actions";

export interface UseStoryDetailParams {
  storyId: string | null;
  isActive: boolean;
  embedded: boolean;
  initialLabels?: StoryLabel[];
  onOpenChange?: (open: boolean) => void;
  onStoryUpdated?: () => void;
}

export function useStoryDetailState(p: UseStoryDetailParams) {
  const [state, setState] = useState<DialogState>(() => ({ kind: "loading", forStoryId: p.storyId ?? "" }));
  const [storyDraft, setStoryDraft] = useState<StoryDraft | null>(null);
  const [storyDraftForId, setStoryDraftForId] = useState<string | null>(null);
  const [isSavingStory, setIsSavingStory] = useState(false);
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});
  const [storyLabels, setStoryLabels] = useState<StoryLabel[]>([]);
  const [storyLabelsForId, setStoryLabelsForId] = useState<string | null>(null);
  const [availableLabels, setAvailableLabels] = useState<StoryLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [pendingLabelIds, setPendingLabelIds] = useState<Record<string, true>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const viewState: DialogState = useMemo(() => {
    if (!p.isActive || !p.storyId) return state;
    return state.forStoryId === p.storyId ? state : { kind: "loading", forStoryId: p.storyId };
  }, [p.isActive, state, p.storyId]);

  const pendingSet = useMemo(() => new Set(Object.keys(pendingTaskIds)), [pendingTaskIds]);
  const pendingLabelSet = useMemo(() => new Set(Object.keys(pendingLabelIds)), [pendingLabelIds]);
  const activeStory = viewState.kind === "ok" ? viewState.story : null;
  const hasUnsavedStoryChanges = useMemo(
    () => activeStory !== null && storyDraft !== null && isStoryDirty(storyDraft, activeStory),
    [activeStory, storyDraft],
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!p.storyId || !p.isActive || storyLabelsForId === p.storyId) return;
    setStoryLabels(p.initialLabels ?? []); setStoryLabelsForId(p.storyId);
    setSelectedLabelId(""); setLabelError(null); setPendingLabelIds({});
  }, [p.initialLabels, p.isActive, p.storyId, storyLabelsForId]);

  useEffect(() => {
    if (!p.storyId || !p.isActive) return;
    let cancelled = false;
    fetchStoryAndTasks(p.storyId)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ok", forStoryId: p.storyId!, story: r.story, tasks: r.tasks });
        if (r.labels.length > 0) { setStoryLabels(r.labels); setStoryLabelsForId(p.storyId!); }
      })
      .catch((err) => { if (!cancelled) setState({ kind: "error", forStoryId: p.storyId!, message: String(err) }); });
    return () => { cancelled = true; };
  }, [p.storyId, p.isActive]);

  useEffect(() => {
    if (!activeStory) return;
    if (storyDraftForId === activeStory.id && storyDraft !== null) return;
    setStoryDraft(toStoryDraft(activeStory)); setStoryDraftForId(activeStory.id); setStoryError(null);
  }, [activeStory, storyDraft, storyDraftForId]);

  useEffect(() => {
    if (!activeStory?.project_id) { setEpics([]); setIsLoadingEpics(false); return; }
    let cancelled = false; setIsLoadingEpics(true);
    fetchEpics(activeStory.project_id)
      .then((items) => { if (!cancelled) setEpics(items); })
      .catch(() => { if (!cancelled) setEpics([]); })
      .finally(() => { if (!cancelled) setIsLoadingEpics(false); });
    return () => { cancelled = true; };
  }, [activeStory]);

  useEffect(() => {
    if (!p.isActive || !p.storyId || !activeStory?.project_id) { setAvailableLabels([]); setIsLoadingLabels(false); return; }
    let cancelled = false; setIsLoadingLabels(true);
    Promise.all([fetchAvailableLabels(activeStory.project_id), fetchStoryLabelsFromBacklogs(p.storyId, activeStory.project_id)])
      .then(([all, attached]) => {
        if (cancelled) return;
        setAvailableLabels(all);
        if (attached.found) setStoryLabels(attached.labels);
        else if (activeStory.labels) setStoryLabels(activeStory.labels);
      })
      .catch(() => { if (!cancelled) setAvailableLabels([]); })
      .finally(() => { if (!cancelled) setIsLoadingLabels(false); });
    return () => { cancelled = true; };
  }, [activeStory, p.isActive, p.storyId]);

  useEffect(() => {
    if (!selectedLabelId) return;
    if (storyLabels.some((l) => l.id === selectedLabelId)) { setSelectedLabelId(""); return; }
    if (!availableLabels.some((l) => l.id === selectedLabelId)) setSelectedLabelId("");
  }, [availableLabels, selectedLabelId, storyLabels]);

  useEffect(() => {
    if (!p.isActive || !hasUnsavedStoryChanges) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { window.removeEventListener("beforeunload", h); };
  }, [hasUnsavedStoryChanges, p.isActive]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const togglePending = (map: Record<string, true>, id: string, on: boolean) => {
    if (on) return { ...map, [id]: true as const };
    const next = { ...map }; delete next[id]; return next;
  };

  const executeDialogClose = () => {
    setStoryDraft(null); setStoryDraftForId(null); setStoryError(null); setTaskError(null);
    setPendingTaskIds({}); setStoryLabels([]); setStoryLabelsForId(null); setAvailableLabels([]);
    setSelectedLabelId(""); setLabelError(null); setPendingLabelIds({});
    p.onOpenChange?.(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) { if (hasUnsavedStoryChanges) { setShowDiscardConfirm(true); return; } executeDialogClose(); }
    else { p.onOpenChange?.(true); }
  };

  const handleCancelChanges = () => {
    if (viewState.kind !== "ok") return;
    setStoryDraft(toStoryDraft(viewState.story)); setStoryError(null);
  };

  const updateStoryDraft = (field: keyof StoryDraft, value: string) => {
    setStoryDraft((prev) => (prev ? { ...prev, [field]: value } : prev)); setStoryError(null);
  };

  const saveStory = async () => {
    if (viewState.kind !== "ok" || !storyDraft || isSavingStory) return;
    if (storyDraft.title.trim() === "") { setStoryError("Story title is required."); return; }
    setStoryError(null); setIsSavingStory(true);
    try {
      const u = await patchStoryFields(viewState.story.id, storyDraft);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, story: u }));
      setStoryDraft(toStoryDraft(u)); setStoryDraftForId(u.id); p.onStoryUpdated?.();
    } catch (e) { setStoryError(e instanceof Error ? e.message : "Failed to save story."); }
    finally { setIsSavingStory(false); }
  };

  const handleStoryStatusChange = async (tid: string, status: ItemStatus) => {
    if (viewState.kind !== "ok" || tid !== viewState.story.id || isSavingStory) return;
    if (viewState.story.status === status) return;
    setStoryError(null); setIsSavingStory(true);
    try {
      const u = await patchStoryStatus(tid, status);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, story: { ...prev.story, ...u } }));
      p.onStoryUpdated?.();
    } catch (e) { setStoryError(e instanceof Error ? e.message : "Failed to update story status."); }
    finally { setIsSavingStory(false); }
  };

  const handleStoryDelete = async (tid: string) => {
    if (isDeletingStory) return;
    setStoryError(null); setIsDeletingStory(true);
    try {
      await deleteStory(tid); p.onStoryUpdated?.();
      if (p.embedded) { window.location.assign("/planning/stories"); return; }
      if (viewState.kind === "ok") { setStoryDraft(toStoryDraft(viewState.story)); setStoryDraftForId(viewState.story.id); }
      executeDialogClose();
    } catch (e) { setStoryError(e instanceof Error ? e.message : "Failed to delete story."); }
    finally { setIsDeletingStory(false); }
  };

  const attachLabel = async () => {
    if (viewState.kind !== "ok" || selectedLabelId.trim() === "" || pendingLabelSet.has(selectedLabelId)) return;
    const nl = availableLabels.find((l) => l.id === selectedLabelId);
    if (!nl) { setLabelError("Selected label is unavailable. Re-open the selector and try again."); return; }
    if (storyLabels.some((l) => l.id === selectedLabelId)) { setLabelError("Label is already attached to this story."); return; }
    const prev = storyLabels; setLabelError(null);
    setPendingLabelIds((m) => togglePending(m, selectedLabelId, true));
    setStoryLabels((arr) => [...arr, nl].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedLabelId("");
    try { await attachLabelApi(viewState.story.id, nl.id); p.onStoryUpdated?.(); }
    catch (e) { setStoryLabels(prev); setLabelError(e instanceof Error ? `Failed to attach label: ${e.message}` : "Failed to attach label."); }
    finally { setPendingLabelIds((m) => togglePending(m, nl.id, false)); }
  };

  const detachLabel = async (labelId: string) => {
    if (viewState.kind !== "ok" || pendingLabelSet.has(labelId)) return;
    const prev = storyLabels; const lbl = prev.find((i) => i.id === labelId);
    if (!lbl) return;
    setLabelError(null); setPendingLabelIds((m) => togglePending(m, labelId, true));
    setStoryLabels((arr) => arr.filter((i) => i.id !== labelId));
    try { await detachLabelApi(viewState.story.id, labelId); p.onStoryUpdated?.(); }
    catch (e) { setStoryLabels(prev); setLabelError(e instanceof Error ? `Failed to detach "${lbl.name}": ${e.message}` : `Failed to detach "${lbl.name}".`); }
    finally { setPendingLabelIds((m) => togglePending(m, labelId, false)); }
  };

  const createTask = async (draft: TaskDraft) => {
    if (viewState.kind !== "ok") return false;
    const title = draft.title.trim();
    if (title === "") { setTaskError("Task title is required."); return false; }
    if (!viewState.story.project_id) { setTaskError("Story has no project context. Cannot create task."); return false; }
    setTaskError(null); setIsCreatingTask(true);
    const tempId = `temp-${Date.now()}`;
    const opt = createOptimisticTask({
      storyId: viewState.story.id, title,
      objective: draft.objective.trim() === "" ? null : draft.objective.trim(),
      task_type: draft.task_type.trim() === "" ? "TASK" : draft.task_type.trim(),
      priority: parseNumberOrNull(draft.priority), estimate_points: parseNumberOrNull(draft.estimate_points),
      due_at: draft.due_at.trim() === "" ? null : draft.due_at.trim(),
    }, tempId);
    setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: addOptimisticTask(prev.tasks, opt) }));
    try {
      const c = await createTaskApi(viewState.story.project_id, viewState.story.id, draft);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: replaceTask(prev.tasks, tempId, c) }));
      p.onStoryUpdated?.(); return true;
    } catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: removeTask(prev.tasks, tempId) }));
      setTaskError(e instanceof Error ? e.message : "Failed to create task."); return false;
    } finally { setIsCreatingTask(false); }
  };

  const patchTask = async (taskId: string, patch: TaskPatch) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return false;
    let previousTask: TaskItem | null = null;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const r = applyOptimisticTaskPatch(prev.tasks, taskId, patch);
      previousTask = r.previousTask; return { ...prev, tasks: r.nextTasks };
    });
    if (!previousTask) return false;
    setTaskError(null); setPendingTaskIds((m) => togglePending(m, taskId, true));
    try {
      const u = await patchTaskApi(taskId, patch);
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: replaceTask(prev.tasks, taskId, u) }));
      p.onStoryUpdated?.(); return true;
    } catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: rollbackTaskPatch(prev.tasks, taskId, previousTask) }));
      setTaskError(e instanceof Error ? e.message : "Failed to update task."); return false;
    } finally { setPendingTaskIds((m) => togglePending(m, taskId, false)); }
  };

  const deleteTaskHandler = async (taskId: string) => {
    if (viewState.kind !== "ok" || pendingSet.has(taskId)) return;
    const prevTasks = viewState.tasks;
    setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: removeTask(prev.tasks, taskId) }));
    setTaskError(null); setPendingTaskIds((m) => togglePending(m, taskId, true));
    try { await deleteTaskApi(taskId); p.onStoryUpdated?.(); }
    catch (e) {
      setState((prev) => (prev.kind !== "ok" ? prev : { ...prev, tasks: prevTasks }));
      setTaskError(e instanceof Error ? e.message : "Failed to delete task.");
    } finally { setPendingTaskIds((m) => togglePending(m, taskId, false)); }
  };

  const markTaskDone = async (taskId: string) => { await patchTask(taskId, toTaskStatusDonePatch()); };

  return {
    viewState, storyDraft, storyError, epics, isLoadingEpics, isSavingStory, isDeletingStory,
    isCreatingTask, taskError, pendingSet, storyLabels, availableLabels, selectedLabelId,
    isLoadingLabels, pendingLabelSet, labelError, hasUnsavedStoryChanges, showDiscardConfirm,
    setShowDiscardConfirm, setSelectedLabelId, executeDialogClose, handleDialogOpenChange,
    handleCancelChanges, updateStoryDraft, saveStory, handleStoryStatusChange, handleStoryDelete,
    attachLabel, detachLabel, createTask, patchTask, deleteTaskHandler, markTaskDone,
  };
}
