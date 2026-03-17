import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFailureFilter,
  buildTimelineUiEvents,
  type RunAttempt,
  type TimelineEvent,
} from "./timeline-view-model.js";

const BASE_EVENTS: TimelineEvent[] = [
  {
    id: "evt-1",
    run_id: "run-1",
    run_status: "RUNNING",
    event_type: "control-plane.run.started",
    decision: "ACCEPTED",
    reason_code: null,
    reason_message: null,
    correlation_id: "corr-1",
    causation_id: "cause-1",
    payload: {},
    occurred_at: "2026-03-08T10:00:00Z",
  },
  {
    id: "evt-2",
    run_id: "run-1",
    run_status: "RUNNING",
    event_type: "control-plane.watchdog.action",
    decision: "ACCEPTED",
    reason_code: "HEARTBEAT_LOSS",
    reason_message: "Watchdog retry",
    correlation_id: "corr-1",
    causation_id: "cause-2",
    payload: { action: "RETRY" },
    occurred_at: "2026-03-08T10:01:00Z",
  },
  {
    id: "evt-3",
    run_id: "run-1",
    run_status: "RUNNING",
    event_type: "control-plane.run.succeeded",
    decision: "REJECTED",
    reason_code: "ILLEGAL_RUN_TRANSITION",
    reason_message: "Cannot transition run from RUNNING to SUCCEEDED",
    correlation_id: "corr-1",
    causation_id: "cause-3",
    payload: {},
    occurred_at: "2026-03-08T10:02:00Z",
  },
];

const ATTEMPTS: RunAttempt[] = [
  {
    outbox_event_id: "out-1",
    occurred_at: "2026-03-08T09:59:00Z",
    next_retry_at: "2026-03-08T10:03:00Z",
    retry_attempt: 2,
    max_attempts: 5,
    dead_lettered_at: null,
    last_error: "WORKER_ERROR: timeout",
    correlation_id: "corr-1",
    causation_id: "cause-4",
  },
  {
    outbox_event_id: "out-2",
    occurred_at: "2026-03-08T10:04:00Z",
    next_retry_at: null,
    retry_attempt: 5,
    max_attempts: 5,
    dead_lettered_at: "2026-03-08T10:05:00Z",
    last_error: "MAX_ATTEMPTS_EXCEEDED",
    correlation_id: "corr-1",
    causation_id: "cause-5",
  },
];

test("buildTimelineUiEvents appends retry/dead-letter synthetic rows and keeps deterministic order", () => {
  const rows = buildTimelineUiEvents(BASE_EVENTS, ATTEMPTS, "run-1", "RUNNING");

  assert.equal(rows[0]?.id, "attempt-dead-letter-out-2");
  assert.equal(rows[1]?.id, "attempt-retry-out-2");
  assert.equal(rows[2]?.id, "attempt-retry-out-1");
  assert.equal(rows[3]?.id, "evt-3");

  const deadLetter = rows.find((row) => row.id === "attempt-dead-letter-out-2");
  assert.equal(deadLetter?.failure_category, "DEAD_LETTER");

  const retry = rows.find((row) => row.id === "attempt-retry-out-1");
  assert.equal(retry?.failure_category, "RETRY");
});

test("applyFailureFilter isolates watchdog and rejected transitions", () => {
  const rows = buildTimelineUiEvents(BASE_EVENTS, ATTEMPTS, "run-1", "RUNNING");

  const watchdogRows = applyFailureFilter(rows, "WATCHDOG");
  assert.deepEqual(watchdogRows.map((row) => row.id), ["evt-2"]);

  const rejectedRows = applyFailureFilter(rows, "TRANSITION_REJECTED");
  assert.deepEqual(rejectedRows.map((row) => row.id), ["evt-3"]);
});
