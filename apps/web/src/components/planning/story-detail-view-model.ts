/**
 * Pure view-model helpers for the story detail dialog.
 * No React, no side effects.
 */

import type { WorkItemStatus, WorkItemDetail, WorkItemLabel, TaskItemView } from "@/lib/planning/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DialogState =
  | { kind: "loading"; forStoryId: string }
  | { kind: "error"; forStoryId: string; message: string }
  | { kind: "ok"; forStoryId: string; story: WorkItemDetail; tasks: TaskItemView[] };

export interface TaskDraft {
  title: string;
  summary: string;
  sub_type: string;
  priority: string;
  estimate_points: string;
  due_at: string;
}

export interface TaskEditDraft extends TaskDraft {
  status: WorkItemStatus;
  is_blocked: boolean;
  blocked_reason: string;
}

export interface StoryDraft {
  title: string;
  sub_type: string;
  description: string;
  summary: string;
  priority: string;
  parent_id: string;
  blocked_reason: string;
}

export interface EpicOption {
  id: string;
  key: string | null;
  title: string;
}

export interface BacklogOption {
  id: string;
}

interface NormalizedStory {
  title: string;
  sub_type: string;
  description: string | null;
  summary: string | null;
  priority: number | null;
  parent_id: string | null;
  blocked_reason: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TASK_TYPE_OPTIONS = [
  { value: "CODING", label: "Coding" },
  { value: "TESTING", label: "Testing" },
  { value: "RESEARCH", label: "Research" },
  { value: "DOCS", label: "Docs" },
  { value: "OPS", label: "Ops" },
] as const;

export const STORY_TYPE_OPTIONS = [
  { value: "USER_STORY", label: "Story" },
  { value: "BUG", label: "Bug" },
  { value: "SPIKE", label: "Spike" },
  { value: "CHORE", label: "Chore" },
] as const;

export const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "CODE_REVIEW", label: "Code Review" },
  { value: "VERIFY", label: "Verify" },
  { value: "DONE", label: "Done" },
];

// ─── Draft helpers ─────────────────────────────────────────────────────────────

export function initialTaskDraft(): TaskDraft {
  return {
    title: "",
    summary: "",
    sub_type: "CODING",
    priority: "",
    estimate_points: "",
    due_at: "",
  };
}

export function initialTaskEditDraft(): TaskEditDraft {
  return {
    ...initialTaskDraft(),
    status: "TODO",
    is_blocked: false,
    blocked_reason: "",
  };
}

export function toStoryDraft(story: WorkItemDetail): StoryDraft {
  return {
    title: story.title ?? "",
    sub_type: story.sub_type ?? "USER_STORY",
    description: story.description ?? "",
    summary: story.summary ?? "",
    priority: story.priority !== null ? String(story.priority) : "",
    parent_id: story.parent_id ?? "",
    blocked_reason: story.blocked_reason ?? "",
  };
}

export function parsePriority(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoryDraft(draft: StoryDraft): NormalizedStory {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const summary = draft.summary.trim();
  const blockedReason = draft.blocked_reason.trim();
  const parentId = draft.parent_id.trim();
  return {
    title,
    sub_type: draft.sub_type,
    description: description === "" ? null : description,
    summary: summary === "" ? null : summary,
    priority: parsePriority(draft.priority),
    parent_id: parentId === "" ? null : parentId,
    blocked_reason: blockedReason === "" ? null : blockedReason,
  };
}

function normalizeStory(story: WorkItemDetail): NormalizedStory {
  return {
    title: story.title.trim(),
    sub_type: story.sub_type,
    description: story.description?.trim() || null,
    summary: story.summary?.trim() || null,
    priority: story.priority,
    parent_id: story.parent_id,
    blocked_reason: story.blocked_reason?.trim() || null,
  };
}

export function isStoryDirty(draft: StoryDraft, story: WorkItemDetail): boolean {
  const d = normalizeStoryDraft(draft);
  const s = normalizeStory(story);
  return (
    d.title !== s.title ||
    d.sub_type !== s.sub_type ||
    d.description !== s.description ||
    d.summary !== s.summary ||
    d.priority !== s.priority ||
    d.parent_id !== s.parent_id ||
    d.blocked_reason !== s.blocked_reason
  );
}

// ─── Date utilities ────────────────────────────────────────────────────────────

export function formatDate(iso: string | null): string | null {
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

export function formatDateTime(iso: string | null): string | null {
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

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.length >= 10 ? iso.slice(0, 10) : "";
  }
  return date.toISOString().slice(0, 10);
}

export function parseNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function parseApiMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { message?: string };
      detail?: Array<{ msg?: string }>;
    };
    if (json.error?.message) return json.error.message;
    if (Array.isArray(json.detail) && json.detail[0]?.msg) return json.detail[0].msg;
  } catch {
    // ignore
  }
  return `Request failed. HTTP ${response.status}.`;
}

export function mapStoryLabelsFromUnknown(value: unknown): WorkItemLabel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      if (typeof data.id !== "string" || typeof data.name !== "string") return null;
      return {
        id: data.id,
        name: data.name,
        color: typeof data.color === "string" ? data.color : null,
      } satisfies WorkItemLabel;
    })
    .filter((item): item is WorkItemLabel => item !== null);
}

export function mapTaskFromApi(raw: Record<string, unknown>): TaskItemView {
  return {
    id: String(raw.id),
    key: raw.key ? String(raw.key) : null,
    title: String(raw.title ?? ""),
    summary: raw.objective ? String(raw.objective) : null,
    sub_type: String(raw.task_type ?? "CODING"),
    status: (raw.status as WorkItemStatus) ?? "TODO",
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

export function toTaskEditDraft(task: TaskItemView): TaskEditDraft {
  return {
    title: task.title,
    summary: task.summary ?? "",
    sub_type: task.sub_type,
    priority: task.priority !== null ? String(task.priority) : "",
    estimate_points: task.estimate_points !== null ? String(task.estimate_points) : "",
    due_at: toDateInputValue(task.due_at),
    status: task.status,
    is_blocked: task.is_blocked,
    blocked_reason: task.blocked_reason ?? "",
  };
}

export function normalizeStoryDraftForSave(draft: StoryDraft): NormalizedStory {
  return normalizeStoryDraft(draft);
}
