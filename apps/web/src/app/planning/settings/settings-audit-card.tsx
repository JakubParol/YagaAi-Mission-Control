import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PlanningSettingsViewModel,
} from "@/lib/planning/settings";

// ─── Helpers ────────────────────────────────────────────────────────

function formatDateLabel(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Props ──────────────────────────────────────────────────────────

export interface SettingsAuditCardProps {
  auditActivity: PlanningSettingsViewModel["audit_activity"];
}

// ─── Component ──────────────────────────────────────────────────────

export function SettingsAuditCard({ auditActivity }: SettingsAuditCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit and activity</CardTitle>
        <CardDescription>
          Activity stream and status history preview from audit tables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="rounded-md border border-border/60 p-3">
          <p className="font-semibold mb-2">Recent activity_log</p>
          <div className="space-y-2">
            {auditActivity.activity_log.map((entry) => (
              <div key={entry.id} className="rounded border border-border/60 p-2">
                <p className="font-medium">{entry.event_name}</p>
                <p className="text-muted-foreground">{entry.message ?? "No message"}</p>
                <p className="text-muted-foreground">
                  {entry.entity_type} {entry.entity_id} | {formatDateLabel(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border/60 p-3">
          <p className="font-semibold mb-2">Recent status history</p>
          <div className="space-y-2">
            {auditActivity.story_status_history.map((entry) => (
              <p key={entry.id} className="text-muted-foreground">
                story {entry.story_id}: {entry.from_status ?? "null"} to {entry.to_status} (
                {formatDateLabel(entry.changed_at)})
              </p>
            ))}
            {auditActivity.task_status_history.map((entry) => (
              <p key={entry.id} className="text-muted-foreground">
                task {entry.task_id}: {entry.from_status ?? "null"} to {entry.to_status} (
                {formatDateLabel(entry.changed_at)})
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border/60 p-3">
          <p className="font-semibold mb-1">Retention notes</p>
          {auditActivity.retention_notes.map((note) => (
            <p key={note} className="text-muted-foreground">
              - {note}
            </p>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-between border-t">
        <Badge variant="outline">Informational</Badge>
        <Button disabled size="sm" variant="outline">
          Configure retention
        </Button>
      </CardFooter>
    </Card>
  );
}
