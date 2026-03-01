import { Calendar, Target, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/lib/planning/types";
import { StoryCard, type StoryCardStory } from "./story-card";

// ─── Types (matches API response shape) ─────────────────────────────

export interface SprintBacklog {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ActiveSprintData {
  backlog: SprintBacklog;
  stories: StoryCardStory[];
}

// ─── Column config ──────────────────────────────────────────────────

const COLUMNS: { status: ItemStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "Todo", accent: "border-l-slate-500" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "border-l-blue-500" },
  { status: "CODE_REVIEW", label: "Code Review", accent: "border-l-violet-500" },
  { status: "VERIFY", label: "Verify", accent: "border-l-amber-500" },
  { status: "DONE", label: "Done", accent: "border-l-emerald-500" },
];

// ─── Sprint Header ──────────────────────────────────────────────────

function SprintHeader({
  backlog,
  stories,
}: {
  backlog: SprintBacklog;
  stories: StoryCardStory[];
}) {
  const total = stories.length;
  const done = stories.filter((s) => s.status === "DONE").length;
  const inProgress = stories.filter(
    (s) => s.status === "IN_PROGRESS" || s.status === "CODE_REVIEW" || s.status === "VERIFY"
  ).length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;

  const formatDate = (d: string | null) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return d;
    }
  };

  const start = formatDate(backlog.start_date);
  const end = formatDate(backlog.end_date);

  return (
    <div className="rounded-lg border border-border bg-card/50 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: name + meta */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">{backlog.name}</h2>
          {backlog.goal && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Target className="size-3.5 shrink-0" />
              {backlog.goal}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {(start || end) && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {start && end ? `${start} – ${end}` : start ?? end}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Hash className="size-3" />
              {total} {total === 1 ? "story" : "stories"}
            </span>
          </div>
        </div>

        {/* Right: progress */}
        <div className="flex flex-col items-end gap-1.5 min-w-[140px]">
          <span className="text-xs font-medium text-muted-foreground">
            {done}/{total} done ({pctDone}%)
          </span>
          {/* Segmented progress bar */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/50">
            {done > 0 && (
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${(done / total) * 100}%` }}
              />
            )}
            {inProgress > 0 && (
              <div
                className="bg-blue-500/70 transition-all duration-300"
                style={{ width: `${(inProgress / total) * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Board Column ───────────────────────────────────────────────────

function BoardColumn({
  label,
  accent,
  stories,
  onStoryClick,
}: {
  label: string;
  accent: string;
  stories: StoryCardStory[];
  onStoryClick?: (storyId: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border/40 bg-muted/20",
        "border-l-2",
        accent
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="flex items-center justify-center min-w-[20px] rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {stories.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {stories.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[80px] text-[11px] text-muted-foreground/50">
            No stories
          </div>
        ) : (
          stories.map((story) => <StoryCard key={story.id} story={story} onClick={onStoryClick} />)
        )}
      </div>
    </div>
  );
}

// ─── Main Board ─────────────────────────────────────────────────────

export function SprintBoard({
  data,
  onStoryClick,
}: {
  data: ActiveSprintData;
  onStoryClick?: (storyId: string) => void;
}) {
  const byStatus = new Map<ItemStatus, StoryCardStory[]>();
  for (const col of COLUMNS) {
    byStatus.set(col.status, []);
  }
  for (const story of data.stories) {
    const bucket = byStatus.get(story.status);
    if (bucket) {
      bucket.push(story);
    }
  }

  return (
    <div>
      <SprintHeader backlog={data.backlog} stories={data.stories} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 overflow-x-auto">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.status}
            label={col.label}
            accent={col.accent}
            stories={byStatus.get(col.status) ?? []}
            onStoryClick={onStoryClick}
          />
        ))}
      </div>
    </div>
  );
}
