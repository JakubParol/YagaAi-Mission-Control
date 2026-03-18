import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_LABEL } from "@/components/planning/story-card";

import {
  COMING_SOON_LABEL,
  formatUpdatedAt,
  getPriorityLabel,
  type PlanningListRow,
} from "./list-view-model";

export interface TaskDetailDialogProps {
  row: PlanningListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ row, open, onOpenChange }: TaskDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{row?.title ?? "Task details"}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{row.key ?? "No key"}</Badge>
              <Badge variant="secondary">{STATUS_LABEL[row.status]}</Badge>
              <Badge variant="outline">{row.sub_type ?? "Task"}</Badge>
            </div>
            <p className="text-muted-foreground">
              {row.summary?.trim()
                ? row.summary
                : "No task objective provided."}
            </p>
            <p className="text-xs text-muted-foreground">
              Priority: {getPriorityLabel(row.priority)} | Updated:{" "}
              {formatUpdatedAt(row.updated_at)}
            </p>
            <p className="text-xs text-amber-300">
              Read-only preview. Full standalone task detail is {COMING_SOON_LABEL.toLowerCase()}
              .
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
