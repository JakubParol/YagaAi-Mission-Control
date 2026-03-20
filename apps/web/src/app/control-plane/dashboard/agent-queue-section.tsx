"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FloatingCard } from "@/components/ui/floating-card";

import type { AgentQueue } from "./dashboard-types";

interface AgentQueueSectionProps {
  queues: AgentQueue[];
}

function QueuePanel({ queue }: { queue: AgentQueue }) {
  const [expanded, setExpanded] = useState(false);
  const count = queue.stories.length;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <FloatingCard className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card/70"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <Chevron className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium text-foreground">{queue.agentName}</span>

        {/* Capacity indicator */}
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {count} queued / {queue.capacity} active
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 pb-3 pt-2">
          {/* Capacity bar */}
          <div className="mb-2 h-1 w-full rounded-full bg-muted/40">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                count > 2 ? "bg-amber-500/70" : "bg-primary/70",
              )}
              style={{ width: `${Math.min((count / 5) * 100, 100)}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {queue.stories.map((story, idx) => (
              <div
                key={story.key}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/20"
              >
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  #{idx + 1}
                </span>
                <span className="font-mono text-[10px] text-primary/80">{story.key}</span>
                <span className="min-w-0 flex-1 truncate text-foreground/80">{story.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  ~{story.estimatedTasks} tasks
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </FloatingCard>
  );
}

export function AgentQueueSection({ queues }: AgentQueueSectionProps) {
  const nonEmpty = queues.filter((q) => q.stories.length > 0);

  return (
    <FloatingCard className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListOrdered className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Agent Queues</h2>
      </div>

      {nonEmpty.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">All queues empty</p>
      ) : (
        <div className="space-y-2">
          {nonEmpty.map((queue) => (
            <QueuePanel key={queue.agentId} queue={queue} />
          ))}
        </div>
      )}
    </FloatingCard>
  );
}
