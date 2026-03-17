/**
 * Timeline page API calls.
 * All fetch operations for the timeline page live here.
 */

import { apiUrl } from "@/lib/api-client";
import type { TimelineEvent, RunAttempt } from "./timeline-view-model";
import type { ApiErrorEnvelope, ListEnvelope, RunState } from "./timeline-types";

export async function parseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorEnvelope;
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Ignore parse errors and use fallback.
  }
  return `${fallback} (HTTP ${response.status}).`;
}

export function normalizeIsoFromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function fetchRuns(params: {
  status: string;
  runId: string;
}): Promise<RunState[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.runId.trim()) query.set("run_id", params.runId.trim());
  query.set("limit", "100");

  const response = await fetch(
    apiUrl(`/v1/orchestration/runs?${query.toString()}`),
  );
  if (!response.ok) {
    throw new Error(
      await parseErrorMessage(response, "Failed to load orchestration runs"),
    );
  }
  const body = (await response.json()) as ListEnvelope<RunState>;
  return body.data ?? [];
}

export async function fetchTimeline(params: {
  runId: string;
  status: string;
  occurredAfter: string | null;
  occurredBefore: string | null;
}): Promise<TimelineEvent[]> {
  const query = new URLSearchParams();
  query.set("run_id", params.runId);
  if (params.status) query.set("status", params.status);
  if (params.occurredAfter) query.set("occurred_after", params.occurredAfter);
  if (params.occurredBefore)
    query.set("occurred_before", params.occurredBefore);
  query.set("limit", "100");

  const response = await fetch(
    apiUrl(`/v1/orchestration/timeline?${query.toString()}`),
  );
  if (!response.ok) {
    throw new Error(
      await parseErrorMessage(response, "Failed to load timeline events"),
    );
  }
  const body = (await response.json()) as ListEnvelope<TimelineEvent>;
  return body.data ?? [];
}

export async function fetchAttempts(runId: string): Promise<RunAttempt[]> {
  const response = await fetch(
    apiUrl(`/v1/orchestration/runs/${runId}/attempts?limit=100`),
  );
  if (!response.ok) {
    throw new Error(
      await parseErrorMessage(response, "Failed to load run attempts"),
    );
  }
  const body = (await response.json()) as ListEnvelope<RunAttempt>;
  return body.data ?? [];
}
