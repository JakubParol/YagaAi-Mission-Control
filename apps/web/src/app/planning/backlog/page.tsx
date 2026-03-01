"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Hash,
  Layers,
  Loader2,
  Zap,
} from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { StoryCard, type StoryCardStory } from "@/components/planning/story-card";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

interface BacklogItem {
  id: string;
  name: string;
  kind: BacklogKind;
  status: BacklogStatus;
  is_default: boolean;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface BacklogWithStories {
  backlog: BacklogItem;
  stories: StoryCardStory[];
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; sections: BacklogWithStories[] };

type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; sections: BacklogWithStories[] };

// ─── Helpers ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<BacklogKind, { label: string; accent: string }> = {
  SPRINT: { label: "Sprint", accent: "border-l-blue-500" },
  BACKLOG: { label: "Backlog", accent: "border-l-slate-500" },
  IDEAS: { label: "Ideas", accent: "border-l-violet-500" },
};

function formatDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return d;
  }
}

// ─── Backlog Section ─────────────────────────────────────────────────

function BacklogSection({
  section,
  isActiveSprint,
  onStoryClick,
}: {
  section: BacklogWithStories;
  isActiveSprint: boolean;
  onStoryClick: (storyId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { backlog, stories } = section;
  const kindConf = KIND_CONFIG[backlog.kind] ?? KIND_CONFIG.BACKLOG;

  const total = stories.length;
  const done = stories.filter((s) => s.status === "DONE").length;
  const inProgress = stories.filter(
    (s) =>
      s.status === "IN_PROGRESS" ||
      s.status === "CODE_REVIEW" ||
      s.status === "VERIFY",
  ).length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;

  const start = formatDate(backlog.start_date);
  const end = formatDate(backlog.end_date);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section
      className={cn(
        "rounded-lg border border-border/60 bg-card/30 overflow-hidden",
        "border-l-2",
        kindConf.accent,
        isActiveSprint && "ring-1 ring-blue-500/20 bg-blue-500/[0.02]",
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "w-full flex items-start justify-between gap-4 px-4 py-3.5",
          "hover:bg-muted/20 transition-colors duration-150 text-left",
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Chevron className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">
                {backlog.name}
              </h3>
              {isActiveSprint && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                  <Zap className="size-2.5" />
                  Active Sprint
                </span>
              )}
              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {kindConf.label}
              </span>
              {backlog.status === "CLOSED" && (
                <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Closed
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {(start || end) && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {start && end ? `${start} – ${end}` : (start ?? end)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Hash className="size-3" />
                {total} {total === 1 ? "story" : "stories"}
              </span>
            </div>
          </div>
        </div>

        {/* Progress */}
        {total > 0 && (
          <div className="flex flex-col items-end gap-1.5 min-w-[120px] shrink-0 pt-0.5">
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {done}/{total} done ({pctDone}%)
            </span>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              {done > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(done / total) * 100}%` }}
                />
              )}
              {inProgress > 0 && (
                <div
                  className="bg-blue-500/60 transition-all duration-300"
                  style={{ width: `${(inProgress / total) * 100}%` }}
                />
              )}
            </div>
          </div>
        )}
      </button>

      {/* Story list */}
      {!collapsed && (
        <div className="border-t border-border/30">
          {stories.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
              No stories in this backlog
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  onClick={onStoryClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function BacklogPage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const prevProjectRef = useRef<string | null>(null);

  const handleStoryClick = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  // Reset fetch result when project changes (synchronous, no effect needed)
  if (prevProjectRef.current !== singleProjectId) {
    prevProjectRef.current = singleProjectId;
    setFetchResult(null);
  }

  // Derive state: no-project → loading (null result) → fetched result
  const state: PageState = !singleProjectId
    ? { kind: "no-project" }
    : fetchResult === null
      ? { kind: "loading" }
      : fetchResult;

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;

    fetch(
      apiUrl(
        `/v1/planning/backlogs?project_id=${singleProjectId}&sort=-kind,-status&limit=100`,
      ),
    )
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then(async (json) => {
        if (cancelled) return;
        const backlogs: BacklogItem[] = json.data;

        if (backlogs.length === 0) {
          setFetchResult({ kind: "empty" });
          return;
        }

        // Fetch stories for each backlog in parallel
        const sections: BacklogWithStories[] = await Promise.all(
          backlogs.map(async (backlog) => {
            const res = await fetch(
              apiUrl(`/v1/planning/backlogs/${backlog.id}/stories`),
            );
            if (!res.ok) return { backlog, stories: [] };
            const body = await res.json();
            return { backlog, stories: body.data ?? [] };
          }),
        );

        if (cancelled) return;

        // Sort: active sprints first, then by kind (SPRINT > BACKLOG > IDEAS), closed last
        sections.sort((a, b) => {
          const aActive =
            a.backlog.kind === "SPRINT" && a.backlog.status === "ACTIVE"
              ? 1
              : 0;
          const bActive =
            b.backlog.kind === "SPRINT" && b.backlog.status === "ACTIVE"
              ? 1
              : 0;
          if (aActive !== bActive) return bActive - aActive;

          const statusOrder = { ACTIVE: 0, CLOSED: 1 };
          const aStatus = statusOrder[a.backlog.status] ?? 0;
          const bStatus = statusOrder[b.backlog.status] ?? 0;
          if (aStatus !== bStatus) return aStatus - bStatus;

          const kindOrder = { SPRINT: 0, BACKLOG: 1, IDEAS: 2 };
          const aKind = kindOrder[a.backlog.kind] ?? 1;
          const bKind = kindOrder[b.backlog.kind] ?? 1;
          return aKind - bKind;
        });

        setFetchResult({ kind: "ok", sections });
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchResult({ kind: "error", message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [singleProjectId]);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Layers className="size-6 text-muted-foreground" />
          <h1 className="text-3xl font-bold text-foreground">Backlog</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          All backlogs and their stories for the selected project.
        </p>
      </div>

      {state.kind === "no-project" && (
        <EmptyState
          icon="backlog"
          title="Select a project"
          description="Choose a single project from the selector above to view its backlogs."
        />
      )}

      {state.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {state.kind === "empty" && (
        <EmptyState
          icon="backlog"
          title="No backlogs"
          description="This project has no backlogs yet. Create a backlog or sprint to get started."
        />
      )}

      {state.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load backlogs"
          description={state.message}
        />
      )}

      {state.kind === "ok" && (
        <div className="flex flex-col gap-3">
          {state.sections.map((section) => (
            <BacklogSection
              key={section.backlog.id}
              section={section}
              isActiveSprint={
                section.backlog.kind === "SPRINT" &&
                section.backlog.status === "ACTIVE"
              }
              onStoryClick={handleStoryClick}
            />
          ))}
        </div>
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={handleDialogClose}
      />
    </>
  );
}
