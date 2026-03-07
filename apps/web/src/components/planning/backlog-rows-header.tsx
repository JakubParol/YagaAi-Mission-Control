import { cn } from "@/lib/utils";
import { BACKLOG_ROW_LAYOUT } from "./backlog-row";

export function BacklogRowsHeader() {
  return (
    <header
      className={cn(
        "grid items-center gap-3 border-b border-border/30 bg-muted/25 px-3 py-2",
        "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        BACKLOG_ROW_LAYOUT.gridTemplate,
      )}
    >
      <span className="col-span-2">Key</span>
      <span>Title</span>
      <span>Labels</span>
      <span>Epic</span>
      <span>Status</span>
      <span className="text-center">SP</span>
      <span className="text-right">Tasks</span>
      <span className="text-center">Assignee</span>
      <span className="text-right">Actions</span>
    </header>
  );
}
