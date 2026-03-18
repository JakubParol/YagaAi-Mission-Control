import { apiUrl } from "@/lib/api-client";
import type { ActiveSprintData } from "@/components/planning/sprint-board";
import type { WorkItemStatus } from "@/lib/planning/types";
import type { QuickCreateAssigneeOption } from "./quick-create";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BoardState =
  | { kind: "no-project" }
  | { kind: "loading"; projectId: string }
  | { kind: "no-sprint"; projectId: string }
  | { kind: "error"; projectId: string; message: string }
  | { kind: "ok"; projectId: string; data: ActiveSprintData };

interface AgentListEnvelope {
  data?: Array<{
    id?: string;
    name?: string;
    last_name?: string | null;
    initials?: string | null;
    role?: string | null;
    avatar?: string | null;
    openclaw_key?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Fetchers                                                           */
/* ------------------------------------------------------------------ */

export async function fetchBoardState(projectId: string): Promise<BoardState> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs/active-sprint?project_id=${projectId}`),
  );

  if (response.status === 404) {
    return { kind: "no-sprint", projectId };
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json: { data: ActiveSprintData } = await response.json();
  return { kind: "ok", projectId, data: json.data };
}

export async function fetchAssigneeOptions(
): Promise<QuickCreateAssigneeOption[]> {
  const response = await fetch(
    apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name"),
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = await response.json();
  const body = json as AgentListEnvelope;
  return (body.data ?? [])
    .filter((item) => item.id && item.name && item.openclaw_key)
    .map((item) => ({
      id: item.id!,
      name: item.name!,
      last_name: item.last_name ?? null,
      initials: item.initials ?? null,
      role: item.role ?? null,
      avatar: item.avatar ?? null,
      openclaw_key: item.openclaw_key!,
    }));
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function patchStoryStatus(
  storyId: string,
  nextStatus: WorkItemStatus,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/work-items/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export async function patchStoryAssignee(
  storyId: string,
  assigneeAgentId: string | null,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/work-items/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_assignee_agent_id: assigneeAgentId }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
