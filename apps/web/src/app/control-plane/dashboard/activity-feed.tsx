"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  GitPullRequest,
  type LucideIcon,
  Play,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FloatingCard } from "@/components/ui/floating-card";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";

import type { ActivityEvent, CanonicalEventType, DashboardAgent } from "./dashboard-types";
import { filterActivityByAgent, formatRelativeTime } from "./dashboard-view-model";

/* ----- Event type → icon / color mapping ----- */

interface EventStyle {
  icon: LucideIcon;
  color: string;
}

const EVENT_STYLE_MAP: Record<CanonicalEventType, EventStyle> = {
  "agent.assignment.requested": { icon: Circle, color: "text-muted-foreground" },
  "agent.assignment.queued": { icon: Circle, color: "text-muted-foreground" },
  "agent.assignment.dispatched": { icon: Play, color: "text-blue-400" },
  "agent.assignment.accepted": { icon: CheckCircle2, color: "text-emerald-400" },
  "agent.assignment.rejected": { icon: XCircle, color: "text-red-400" },
  "agent.assignment.ack_timed_out": { icon: ShieldAlert, color: "text-amber-400" },
  "agent.assignment.retry_scheduled": { icon: ShieldAlert, color: "text-amber-400" },
  "agent.planning.started": { icon: Play, color: "text-blue-400" },
  "agent.planning.completed": { icon: CheckCircle2, color: "text-emerald-400" },
  "agent.planning.blocked": { icon: XCircle, color: "text-red-400" },
  "agent.execution.started": { icon: Play, color: "text-blue-400" },
  "agent.execution.completed": { icon: CheckCircle2, color: "text-emerald-400" },
  "agent.execution.failed": { icon: XCircle, color: "text-red-400" },
  "agent.task.started": { icon: Play, color: "text-blue-400" },
  "agent.task.completed": { icon: CheckCircle2, color: "text-emerald-400" },
  "agent.task.blocked": { icon: XCircle, color: "text-red-400" },
  "agent.pr.opened": { icon: GitPullRequest, color: "text-purple-400" },
  "agent.review.requested": { icon: GitPullRequest, color: "text-purple-400" },
  "agent.dispatch.failed": { icon: XCircle, color: "text-red-400" },
  "agent.session.stale": { icon: ShieldAlert, color: "text-amber-400" },
  "agent.watchdog.intervened": { icon: XCircle, color: "text-red-400" },
};

function eventStyle(t: CanonicalEventType): EventStyle {
  return EVENT_STYLE_MAP[t];
}

/* ----- Component ----- */

interface ActivityFeedProps {
  events: ActivityEvent[];
  agents: DashboardAgent[];
}

export function ActivityFeed({ events, agents }: ActivityFeedProps) {
  const [agentFilter, setAgentFilter] = useState("");

  const filterOptions: ThemedSelectOption[] = [
    { value: "", label: "All agents" },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  const filtered = filterActivityByAgent(events, agentFilter || null);

  return (
    <FloatingCard className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex-1 text-sm font-semibold text-foreground">Activity Timeline</h2>
        <div className="w-36">
          <ThemedSelect
            value={agentFilter}
            options={filterOptions}
            placeholder="All agents"
            ariaLabel="Filter by agent"
            onValueChange={setAgentFilter}
          />
        </div>
      </div>

      <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity to show</p>
        ) : (
          filtered.map((evt) => {
            const style = eventStyle(evt.eventType);
            const Icon = style.icon;
            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/20"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", style.color)} />
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-[9px] font-semibold text-foreground">
                  {evt.agentInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground/90">{evt.description}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                    {evt.storyKey && (
                      <span className="font-mono text-[10px] text-primary/60">{evt.storyKey}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </FloatingCard>
  );
}
