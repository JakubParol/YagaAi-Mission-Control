/**
 * Server-side and client-side data fetching / mutation actions
 * for the epics overview page.
 */

import { apiUrl } from "@/lib/api-client";
import type { WorkItemStatus } from "@/lib/planning/types";

import {
  toActionHttpErrorMessage,
  toBulkResultErrorMessage,
} from "./overview-actions";
import {
  EPIC_OVERVIEW_DEFAULT_FILTERS,
  EPIC_OVERVIEW_SORT_OPTIONS,
  type EpicOverviewAgent,
  type EpicOverviewFilters,
  type EpicOverviewLabel,
  type EpicOverviewListEnvelope,
  type EpicOverviewStoryPreview,
} from "./overview-types";

// ─── Response envelopes (match API shapes) ──────────────────────────

interface AgentListEnvelope {
  data?: Array<{
    id?: string;
    name?: string;
    last_name?: string | null;
  }>;
}

interface LabelListEnvelope {
  data?: Array<{
    name?: string;
  }>;
}

interface StoryListEnvelope {
  data?: Array<{
    id?: string;
    key?: string | null;
    title?: string;
    status?: string;
    current_assignee_agent_id?: string | null;
    is_blocked?: boolean;
    updated_at?: string;
  }>;
}

interface BulkOperationEnvelope {
  data?: {
    results?: Array<{
      entity_id?: string;
      success?: boolean;
      timestamp?: string;
      error_code?: string | null;
      error_message?: string | null;
    }>;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export interface FetchResult {
  rows: EpicOverviewItem[];
  agents: EpicOverviewAgent[];
  labels: EpicOverviewLabel[];
}

// Re-export for convenience (used by page.tsx)
import type { EpicOverviewItem } from "./overview-types";

// ─── Parsers ────────────────────────────────────────────────────────

export function parseEpicStatus(value: string | null): WorkItemStatus | "" {
  if (value === "TODO" || value === "IN_PROGRESS" || value === "DONE") return value;
  return "";
}

export function parseItemStatus(value: string | null | undefined): WorkItemStatus | null {
  if (
    value === "TODO"
    || value === "IN_PROGRESS"
    || value === "CODE_REVIEW"
    || value === "VERIFY"
    || value === "DONE"
  ) {
    return value;
  }
  return null;
}

export function parseBlocked(value: string | null): EpicOverviewFilters["blocked"] {
  if (value === "true" || value === "false") return value;
  return "";
}

export function parseSort(value: string | null): EpicOverviewFilters["sort"] {
  const allowed = new Set(EPIC_OVERVIEW_SORT_OPTIONS.map((item) => item.value));
  if (value && allowed.has(value as EpicOverviewFilters["sort"])) {
    return value as EpicOverviewFilters["sort"];
  }
  return EPIC_OVERVIEW_DEFAULT_FILTERS.sort;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function resolveAgentLabel(
  agent: { id?: string; name?: string; last_name?: string | null },
): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

// ─── Fetch overview (epics + agents + labels) ───────────────────────

export async function fetchOverview(
  projectId: string,
  filters: EpicOverviewFilters,
): Promise<FetchResult> {
  const overviewParams = new URLSearchParams();
  overviewParams.set("project_id", projectId);
  overviewParams.set("limit", "100");
  overviewParams.set("sort", filters.sort);

  if (filters.search.trim().length > 0) overviewParams.set("text_search", filters.search.trim());
  if (filters.status.length > 0) overviewParams.set("status", filters.status);
  if (filters.ownerId.length > 0) overviewParams.set("assignee_id", filters.ownerId);
  if (filters.label.trim().length > 0) overviewParams.set("label", filters.label.trim());
  if (filters.blocked.length > 0) overviewParams.set("is_blocked", filters.blocked);

  const [overviewRes, agentsRes, labelsRes] = await Promise.all([
    fetch(apiUrl(`/v1/planning/work-items/overview?type=EPIC&${overviewParams.toString()}`)),
    fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name")),
    fetch(apiUrl(`/v1/planning/labels?project_id=${projectId}&limit=100&sort=name`)),
  ]);

  if (!overviewRes.ok) {
    throw new Error(`Failed to load epic overview. HTTP ${overviewRes.status}.`);
  }

  const overviewBody = (await overviewRes.json()) as EpicOverviewListEnvelope;
  const rows = overviewBody.data ?? [];

  const agents = agentsRes.ok
    ? (((await agentsRes.json()) as AgentListEnvelope).data ?? [])
      .map((item) => {
        const label = resolveAgentLabel(item);
        return label && item.id ? { id: item.id, label } : null;
      })
      .filter((item): item is EpicOverviewAgent => item !== null)
      .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  const labels = labelsRes.ok
    ? (((await labelsRes.json()) as LabelListEnvelope).data ?? [])
      .map((item) => {
        const name = item.name?.trim();
        return name ? { name } : null;
      })
      .filter((item): item is EpicOverviewLabel => item !== null)
    : [];

  return { rows, agents, labels };
}

// ─── Fetch stories preview for a single epic ────────────────────────

export async function fetchStoriesPreview(
  epicId: string,
  projectId: string | null,
  agentLabelById: Map<string, string>,
): Promise<EpicOverviewStoryPreview[]> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set("project_id", projectId);
  }
  params.set("parent_id", epicId);
  params.set("sort", "-updated_at");
  params.set("limit", "100");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const response = await fetch(apiUrl(`/v1/planning/work-items/?type=STORY&${params.toString()}`), {
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
  if (!response.ok) {
    throw new Error(`Failed to load stories preview. HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as StoryListEnvelope;
  const storyRows = payload.data ?? [];

  return storyRows.flatMap((row) => {
    const id = row.id;
    const title = row.title;
    const status = parseItemStatus(row.status);
    if (!id || !title || !status) return [];
    const assigneeId = row.current_assignee_agent_id ?? null;
    return [{
      work_item_id: id,
      work_item_key: row.key ?? null,
      title,
      status,
      current_assignee_agent_id: assigneeId,
      assignee_label: assigneeId ? (agentLabelById.get(assigneeId) ?? null) : null,
      is_blocked: row.is_blocked ?? false,
      updated_at: row.updated_at ?? null,
    } satisfies EpicOverviewStoryPreview];
  });
}

// ─── Change story status (bulk endpoint, single story) ──────────────

export async function changeStoryStatus(
  storyId: string,
  nextStatus: WorkItemStatus,
): Promise<{ timestamp: string | null }> {
  const response = await fetch(apiUrl("/v1/planning/work-items/bulk/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      work_item_ids: [storyId],
      status: nextStatus,
    }),
  });

  if (!response.ok) {
    throw new Error(await toActionHttpErrorMessage(response, "status"));
  }

  const payload = (await response.json()) as BulkOperationEnvelope;
  const result = payload.data?.results?.find((item) => item.entity_id === storyId);
  if (!result || !result.success) {
    throw new Error(toBulkResultErrorMessage(result ?? {}, "status"));
  }

  return { timestamp: result.timestamp ?? null };
}

// ─── Add story to active sprint (bulk endpoint, single story) ───────

export async function addStoryToSprint(
  storyId: string,
  projectId: string,
): Promise<{ timestamp: string | null }> {
  const response = await fetch(
    apiUrl(`/v1/planning/work-items/bulk/active-sprint/add?project_id=${projectId}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_item_ids: [storyId] }),
    },
  );

  if (!response.ok) {
    throw new Error(await toActionHttpErrorMessage(response, "add-to-sprint"));
  }

  const payload = (await response.json()) as BulkOperationEnvelope;
  const result = payload.data?.results?.find((item) => item.entity_id === storyId);
  if (!result || !result.success) {
    throw new Error(toBulkResultErrorMessage(result ?? {}, "add-to-sprint"));
  }

  return { timestamp: result.timestamp ?? null };
}
