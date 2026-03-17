/**
 * Types for the timeline page.
 * Pure type definitions — no React, no side effects.
 */

import type { ThemedSelectOption } from "@/components/ui/themed-select";
import type { RunStatus } from "./timeline-view-model";

export interface RunState {
  run_id: string;
  status: RunStatus;
  correlation_id: string;
  causation_id: string | null;
  last_event_type: string;
  updated_at: string;
  created_at: string;
}

export interface ListEnvelope<T> {
  data: T[];
}

export interface ApiErrorEnvelope {
  error?: {
    message?: string;
  };
}

export const STATUS_OPTIONS: ThemedSelectOption[] = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "RUNNING", label: "Running" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const FAILURE_OPTIONS: ThemedSelectOption[] = [
  { value: "", label: "All transitions" },
  { value: "WATCHDOG", label: "Watchdog actions" },
  { value: "RETRY", label: "Retry transitions" },
  { value: "DEAD_LETTER", label: "Dead-letter transitions" },
  { value: "TRANSITION_REJECTED", label: "Rejected transitions" },
];
