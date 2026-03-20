/* ------------------------------------------------------------------ */
/*  MC-553 — Control Plane Dashboard types                            */
/* ------------------------------------------------------------------ */

export type AgentRuntimeState =
  | "IDLE"
  | "EXECUTING"
  | "PLANNING"
  | "BLOCKED"
  | "REVIEW_READY";

export type AgentRole = "orchestrator" | "fullstack-dev" | "qa" | "researcher";

export interface StoryProgress {
  key: string;
  title: string;
  done: number;
  total: number;
}

export interface DashboardAgent {
  id: string;
  name: string;
  role: AgentRole;
  initials: string;
  state: AgentRuntimeState;
  activeStory: StoryProgress | null;
  currentTask: string | null;
  lastActivityAt: string;
}

export interface QueuedStory {
  key: string;
  title: string;
  estimatedTasks: number;
}

export interface AgentQueue {
  agentId: string;
  agentName: string;
  capacity: number;
  stories: QueuedStory[];
}

export type CanonicalEventType =
  | "agent.assignment.requested"
  | "agent.assignment.queued"
  | "agent.assignment.dispatched"
  | "agent.assignment.accepted"
  | "agent.assignment.rejected"
  | "agent.assignment.ack_timed_out"
  | "agent.assignment.retry_scheduled"
  | "agent.planning.started"
  | "agent.planning.completed"
  | "agent.planning.blocked"
  | "agent.execution.started"
  | "agent.execution.completed"
  | "agent.execution.failed"
  | "agent.task.started"
  | "agent.task.completed"
  | "agent.task.blocked"
  | "agent.pr.opened"
  | "agent.review.requested"
  | "agent.dispatch.failed"
  | "agent.session.stale"
  | "agent.watchdog.intervened";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  agentInitials: string;
  eventType: CanonicalEventType;
  description: string;
  storyKey: string | null;
}

export type AlertSeverity = "warning" | "error";

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  agentId: string | null;
  storyKey: string | null;
  timestamp: string;
}

export interface SummaryStats {
  storiesInProgress: number;
  storiesQueued: number;
  storiesBlocked: number;
  storiesDoneToday: number;
  tasksCompletedToday: number;
  prsOpen: number;
  prsAwaitingReview: number;
  avgTaskCompletionMinutes: number;
}

export interface AgentStateStyle {
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
}

export const AGENT_STATE_CONFIG: Record<AgentRuntimeState, AgentStateStyle> = {
  IDLE: {
    label: "Idle",
    dotColor: "bg-zinc-400",
    bgColor: "bg-zinc-500/10",
    textColor: "text-zinc-300",
  },
  EXECUTING: {
    label: "Executing",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-300",
  },
  PLANNING: {
    label: "Planning",
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-300",
  },
  BLOCKED: {
    label: "Blocked",
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-300",
  },
  REVIEW_READY: {
    label: "Review Ready",
    dotColor: "bg-purple-400",
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-300",
  },
};
