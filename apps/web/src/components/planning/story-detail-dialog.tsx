"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoryView, type StoryDetail, type TaskItem } from "./story-view";

type DialogState =
  | { kind: "loading"; forStoryId: string }
  | { kind: "error"; forStoryId: string; message: string }
  | { kind: "ok"; forStoryId: string; story: StoryDetail; tasks: TaskItem[] };

export function StoryDetailDialog({
  storyId,
  open,
  onOpenChange,
}: {
  storyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<DialogState>(() => ({
    kind: "loading",
    forStoryId: storyId ?? "",
  }));

  const viewState: DialogState =
    open && storyId
      ? state.forStoryId === storyId
        ? state
        : { kind: "loading", forStoryId: storyId }
      : state;

  useEffect(() => {
    if (!storyId || !open) return;

    let cancelled = false;

    Promise.all([
      fetch(apiUrl(`/v1/planning/stories/${storyId}`)).then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      }),
      fetch(apiUrl(`/v1/planning/tasks?story_id=${storyId}&sort=priority`)).then((res) => {
        if (!res.ok) throw new Error(`Tasks API error: ${res.status}`);
        return res.json();
      }),
    ])
      .then(([storyJson, tasksJson]) => {
        if (!cancelled)
          setState({
            kind: "ok",
            forStoryId: storyId,
            story: storyJson.data,
            tasks: tasksJson.data ?? [],
          });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ kind: "error", forStoryId: storyId, message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [storyId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        {viewState.kind === "loading" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Loading story…</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {viewState.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Error</DialogTitle>
            </DialogHeader>
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{viewState.message}</p>
            </div>
          </>
        )}

        {viewState.kind === "ok" && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{viewState.story.title}</DialogTitle>
            </DialogHeader>
            <StoryView
              story={viewState.story}
              tasks={viewState.tasks}
              headerActions={
                <a
                  href={`/planning/stories/${viewState.story.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  Open in new tab
                </a>
              }
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
