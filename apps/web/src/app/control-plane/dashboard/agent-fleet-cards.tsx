import { cn } from "@/lib/utils";
import { FloatingCard } from "@/components/ui/floating-card";

import type { DashboardAgent } from "./dashboard-types";
import { AGENT_STATE_CONFIG } from "./dashboard-types";
import { formatRelativeTime } from "./dashboard-view-model";

interface AgentFleetCardsProps {
  agents: DashboardAgent[];
}

function AgentStateBadge({ state }: { state: DashboardAgent["state"] }) {
  const cfg = AGENT_STATE_CONFIG[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        cfg.bgColor,
        cfg.textColor,
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", cfg.dotColor)} />
      {cfg.label}
    </span>
  );
}

function TaskProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted/40">
        <div
          className="h-full rounded-full bg-primary/70 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

function AgentCard({ agent }: { agent: DashboardAgent }) {
  return (
    <FloatingCard className="flex flex-col gap-3 p-4 transition-colors hover:bg-card/70">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-sm font-semibold text-foreground">
            {agent.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {agent.role.replace("-", " ")}
            </p>
          </div>
        </div>
        <AgentStateBadge state={agent.state} />
      </div>

      {/* Active story */}
      {agent.activeStory ? (
        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-primary/80">{agent.activeStory.key}</span>
            <span className="truncate text-xs text-foreground">{agent.activeStory.title}</span>
          </div>
          <TaskProgress done={agent.activeStory.done} total={agent.activeStory.total} />
        </div>
      ) : (
        <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          No active story
        </div>
      )}

      {/* Current task + last activity */}
      <div className="mt-auto space-y-1">
        {agent.currentTask && (
          <p className="truncate text-xs text-muted-foreground">
            <span className="text-foreground/70">Task:</span> {agent.currentTask}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/70">
          Last activity {formatRelativeTime(agent.lastActivityAt)}
        </p>
      </div>
    </FloatingCard>
  );
}

export function AgentFleetCards({ agents }: AgentFleetCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
