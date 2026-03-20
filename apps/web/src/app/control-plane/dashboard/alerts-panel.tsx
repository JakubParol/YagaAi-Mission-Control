import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FloatingCard } from "@/components/ui/floating-card";

import type { DashboardAlert } from "./dashboard-types";
import { formatRelativeTime, sortAlertsBySeverity } from "./dashboard-view-model";

interface AlertsPanelProps {
  alerts: DashboardAlert[];
}

const SEVERITY_ICON = {
  warning: AlertTriangle,
  error: XCircle,
} as const;

const SEVERITY_STYLE = {
  warning: "text-amber-400",
  error: "text-red-400",
} as const;

const SEVERITY_BORDER = {
  warning: "border-amber-400/20",
  error: "border-red-500/20",
} as const;

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const sorted = sortAlertsBySeverity(alerts);

  return (
    <FloatingCard className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Alerts &amp; Exceptions</h2>
        {sorted.length > 0 && (
          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300 text-[10px]">
            {sorted.length}
          </Badge>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-400" />
          No active alerts
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((alert) => {
            const Icon = SEVERITY_ICON[alert.severity];
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex gap-3 rounded-md border bg-card/30 p-3",
                  SEVERITY_BORDER[alert.severity],
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_STYLE[alert.severity])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{alert.title}</span>
                    {alert.storyKey && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {alert.storyKey}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {formatRelativeTime(alert.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </FloatingCard>
  );
}
