export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type FailureCategory = "WATCHDOG" | "RETRY" | "DEAD_LETTER" | "TRANSITION_REJECTED";
export type FailureCategoryFilter = "" | FailureCategory;

export interface TimelineEvent {
  id: string;
  run_id: string;
  run_status: RunStatus;
  event_type: string;
  decision: string;
  reason_code: string | null;
  reason_message: string | null;
  correlation_id: string;
  causation_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface RunAttempt {
  outbox_event_id: string;
  occurred_at: string;
  next_retry_at: string | null;
  retry_attempt: number;
  max_attempts: number;
  dead_lettered_at: string | null;
  last_error: string | null;
  correlation_id: string;
  causation_id: string | null;
}

export interface TimelineUiEvent {
  id: string;
  run_id: string;
  run_status: RunStatus;
  event_type: string;
  decision: string;
  reason_code: string | null;
  reason_message: string | null;
  correlation_id: string;
  causation_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
  source: "timeline" | "attempt";
  failure_category: FailureCategory | null;
}

export function normalizeCategory(event: TimelineUiEvent): FailureCategory | null {
  if (event.source === "attempt") {
    if (event.event_type === "orchestration.delivery.dead_lettered") {
      return "DEAD_LETTER";
    }
    if (event.event_type === "orchestration.delivery.retry_scheduled") {
      return "RETRY";
    }
  }

  if (event.event_type.includes("watchdog")) {
    return "WATCHDOG";
  }
  if (event.decision === "REJECTED") {
    return "TRANSITION_REJECTED";
  }
  if (event.event_type.includes("retry")) {
    return "RETRY";
  }
  if (event.event_type.includes("dead_letter")) {
    return "DEAD_LETTER";
  }
  return null;
}

export function toAttemptEvents(
  attempts: readonly RunAttempt[],
  runId: string,
  runStatus: RunStatus,
): TimelineUiEvent[] {
  const events: TimelineUiEvent[] = [];

  for (const attempt of attempts) {
    if (attempt.retry_attempt > 1) {
      events.push({
        id: `attempt-retry-${attempt.outbox_event_id}`,
        run_id: runId,
        run_status: runStatus,
        event_type: "orchestration.delivery.retry_scheduled",
        decision: "ACCEPTED",
        reason_code: "RETRY_SCHEDULED",
        reason_message: attempt.last_error,
        correlation_id: attempt.correlation_id,
        causation_id: attempt.causation_id,
        payload: {
          retry_attempt: attempt.retry_attempt,
          max_attempts: attempt.max_attempts,
          source_outbox_event_id: attempt.outbox_event_id,
        },
        occurred_at: attempt.next_retry_at ?? attempt.occurred_at,
        source: "attempt",
        failure_category: "RETRY",
      });
    }

    if (attempt.dead_lettered_at) {
      events.push({
        id: `attempt-dead-letter-${attempt.outbox_event_id}`,
        run_id: runId,
        run_status: runStatus,
        event_type: "orchestration.delivery.dead_lettered",
        decision: "REJECTED",
        reason_code: "MAX_ATTEMPTS_EXCEEDED",
        reason_message: attempt.last_error,
        correlation_id: attempt.correlation_id,
        causation_id: attempt.causation_id,
        payload: {
          retry_attempt: attempt.retry_attempt,
          max_attempts: attempt.max_attempts,
          source_outbox_event_id: attempt.outbox_event_id,
        },
        occurred_at: attempt.dead_lettered_at,
        source: "attempt",
        failure_category: "DEAD_LETTER",
      });
    }
  }

  return events;
}

export function buildTimelineUiEvents(
  timeline: readonly TimelineEvent[],
  attempts: readonly RunAttempt[],
  runId: string,
  runStatus: RunStatus,
): TimelineUiEvent[] {
  const mappedTimeline = timeline.map((event) => {
    const row: TimelineUiEvent = {
      id: event.id,
      run_id: event.run_id,
      run_status: event.run_status,
      event_type: event.event_type,
      decision: event.decision,
      reason_code: event.reason_code,
      reason_message: event.reason_message,
      correlation_id: event.correlation_id,
      causation_id: event.causation_id,
      payload: event.payload,
      occurred_at: event.occurred_at,
      source: "timeline",
      failure_category: null,
    };
    return {
      ...row,
      failure_category: normalizeCategory(row),
    };
  });

  const synthetic = toAttemptEvents(attempts, runId, runStatus).map((event) => ({
    ...event,
    failure_category: normalizeCategory(event),
  }));

  return [...mappedTimeline, ...synthetic].sort((a, b) => {
    const timeDiff = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });
}

export function applyFailureFilter(
  events: readonly TimelineUiEvent[],
  category: FailureCategoryFilter,
): TimelineUiEvent[] {
  if (!category) return [...events];
  return events.filter((event) => event.failure_category === category);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function statusBadgeClass(status: RunStatus): string {
  if (status === "RUNNING")
    return "border-blue-400/40 bg-blue-500/10 text-blue-200";
  if (status === "SUCCEEDED")
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "FAILED")
    return "border-red-400/40 bg-red-500/10 text-red-200";
  if (status === "CANCELLED")
    return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
}

export function eventLabel(value: string): string {
  return value
    .replace("orchestration.", "")
    .replaceAll(".", " ")
    .replaceAll("_", " ");
}
