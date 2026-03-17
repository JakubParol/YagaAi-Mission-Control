/**
 * API call helpers for the backlog edit dialog.
 * All fetch/mutation logic lives here to keep the UI component pure.
 */

import { apiUrl } from "@/lib/api-client";

import type { BacklogEditItem, BacklogDraft } from "./backlog-edit-dialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function toBacklogDraft(backlog: BacklogEditItem): BacklogDraft {
  return {
    name: backlog.name,
    goal: backlog.goal ?? "",
    start_date: backlog.start_date ? backlog.start_date.slice(0, 10) : "",
    end_date: backlog.end_date ? backlog.end_date.slice(0, 10) : "",
  };
}

export function isDraftDirty(draft: BacklogDraft, backlog: BacklogEditItem): boolean {
  const trimmedName = draft.name.trim();
  const trimmedGoal = draft.goal.trim();
  const originalGoal = backlog.goal?.trim() ?? "";
  const originalStartDate = backlog.start_date ? backlog.start_date.slice(0, 10) : "";
  const originalEndDate = backlog.end_date ? backlog.end_date.slice(0, 10) : "";

  return (
    trimmedName !== backlog.name ||
    trimmedGoal !== originalGoal ||
    draft.start_date !== originalStartDate ||
    draft.end_date !== originalEndDate
  );
}

async function parseApiMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { message?: string };
    };
    if (json.error?.message) return json.error.message;
  } catch {
    // ignore
  }
  return `Request failed. HTTP ${response.status}.`;
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateDraft(
  draft: BacklogDraft,
  isSprint: boolean,
): string | null {
  if (draft.name.trim() === "") return "Board name is required.";
  if (isSprint && draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
    return "End date must be on or after start date.";
  }
  return null;
}

// ── API mutation ─────────────────────────────────────────────────────────────

export async function patchBacklog(
  backlogId: string,
  draft: BacklogDraft,
  isSprint: boolean,
): Promise<void> {
  const trimmedName = draft.name.trim();
  const body: Record<string, unknown> = { name: trimmedName };

  if (isSprint) {
    const trimmedGoal = draft.goal.trim();
    body.goal = trimmedGoal === "" ? null : trimmedGoal;
    body.start_date = draft.start_date === "" ? null : draft.start_date;
    body.end_date = draft.end_date === "" ? null : draft.end_date;
  }

  const response = await fetch(apiUrl(`/v1/planning/backlogs/${backlogId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseApiMessage(response));
  }
}
