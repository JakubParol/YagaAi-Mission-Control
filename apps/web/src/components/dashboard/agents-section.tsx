"use client";

import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { AgentStatus } from "@/lib/dashboard-types";

const AGENT_INITIALS: Record<string, string> = {
  James: "J",
  Naomi: "N",
  Amos: "A",
  Alex: "X",
};

const AGENT_COLORS: Record<string, string> = {
  James: "bg-primary/20 text-primary",
  Naomi: "bg-blue-500/20 text-blue-400",
  Amos: "bg-green-500/20 text-green-400",
  Alex: "bg-purple-500/20 text-purple-400",
};

function AgentCard({ agent }: { agent: AgentStatus }) {
  const isWorking = agent.status === "working";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
            AGENT_COLORS[agent.name] ?? "bg-muted text-muted-foreground",
          )}
        >
          {AGENT_INITIALS[agent.name] ?? agent.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <div
          className="flex items-center gap-1.5"
          role="status"
          aria-label={`${agent.name} is ${agent.status}`}
        >
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              isWorking
                ? "animate-pulse bg-amber-400"
                : "bg-green-400",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              isWorking ? "text-amber-400" : "text-green-400",
            )}
          >
            {isWorking ? "Working" : "Idle"}
          </span>
        </div>
      </div>
      {isWorking && agent.task && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {agent.task}
        </p>
      )}
    </div>
  );
}

export function AgentsSection({ initialData }: { initialData: AgentStatus[] }) {
  const { data: agents } = useAutoRefresh<AgentStatus[]>({
    url: apiUrl("/v1/observability/agents"),
    interval: 15000,
    initialData,
  });

  return (
    <section aria-label="Agent status">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Agents</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </section>
  );
}
