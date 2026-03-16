/**
 * Pure view-model helpers for the story detail dialog.
 * No React, no side effects.
 */

import type { ItemStatus } from "@/lib/planning/types";
import type { StoryDetail, TaskItem } from "./story-types";
import type { StoryLabel } from "./story-label-chips";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DialogState =
  | { kind: "loading"; forStoryId: string }
  | { kind: "error"; forStoryId: string; message: string }
  | { kind: "ok"; forStoryId: string; story: StoryDetail; tasks: TaskItem[] };

export interface TaskDraft {
  title: string;
  objective: string;
  task_type: string;
  priority: string;
  estimate_points: string;
  due_at: string;
}

export interface TaskEditDraft extends TaskDraft {
  status: ItemStatus;
  is_blocked: boolean;
  blocked_reason: string;
}

export interface StoryDraft {
  title: string;
  story_type: string;
  description: string;
  intent: string;
  priority: string;
  epic_id: string;
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
  story_type: string;
  description: string | null;
  intent: string | null;
  priority: number | null;
  epic_id: string | null;
  blocked_reason: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TASK_TYPE_OPTIONS = ["CODING", "TESTING", "RESEARCH", "DOCS", "OPS"] as const;

export const STORY_TYPE_OPTIONS = [
  { value: "USER_STORY", label: "Story" },
  { value: "BUG", label: "Bug" },
  { value: "SPIKE", label: "Spike" },
  { value: "CHORE", label: "Chore" },
] as const;

export const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
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
    objective: "",
    task_type: "CODING",
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

export function toStoryDraft(story: StoryDetail): StoryDraft {
  return {
    title: story.title ?? "",
    story_type: story.story_type ?? "USER_STORY",
    description: story.description ?? "",
    intent: story.intent ?? "",
    priority: story.priority !== null ? String(story.priority) : "",
    epic_id: story.epic_id ?? "",
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
  const intent = draft.intent.trim();
  const blockedReason = draft.blocked_reason.trim();
  const epicId = draft.epic_id.trim();
  return {
    title,
    story_type: draft.story_type,
    description: description === "" ? null : description,
    intent: intent === "" ? null : intent,
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
    intent: story.intent?.trim() || null,
    priority: story.priority,
    epic_id: story.epic_id,
    blocked_reason: story.blocked_reason?.trim() || null,
  };
}

export function isStoryDirty(draft: StoryDraft, story: StoryDetail): boolean {
  const d = normalizeStoryDraft(draft);
  const s = normalizeStory(story);
  return (
    d.title !== s.title ||
    d.story_type !== s.story_type ||
    d.description !== s.description ||
    d.intent !== s.intent ||
    d.priority !== s.priority ||
    d.epic_id !== s.epic_id ||
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

export function mapStoryLabelsFromUnknown(value: unknown): StoryLabel[] {
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
      } satisfies StoryLabel;
    })
    .filter((item): item is StoryLabel => item !== null);
}

export function mapTaskFromApi(raw: Record<string, unknown>): TaskItem {
  return {
    id: String(raw.id),
    key: raw.key ? String(raw.key) : null,
    title: String(raw.title ?? ""),
    objective: raw.objective ? String(raw.objective) : null,
    task_type: String(raw.task_type ?? "CODING"),
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

export function toTaskEditDraft(task: TaskItem): TaskEditDraft {
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

export function normalizeStoryDraftForSave(draft: StoryDraft): NormalizedStory {
  return normalizeStoryDraft(draft);
}
