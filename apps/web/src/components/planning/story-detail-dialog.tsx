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
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; story: StoryDetail; tasks: TaskItem[] };

export function StoryDetailDialog({
  storyId,
  open,
  onOpenChange,
}: {
  storyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<DialogState>({ kind: "loading" });

  useEffect(() => {
    if (!storyId || !open) return;

    let cancelled = false;
    setState({ kind: "loading" });

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
          setState({ kind: "ok", story: storyJson.data, tasks: tasksJson.data ?? [] });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [storyId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        {state.kind === "loading" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Loading story…</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {state.kind === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Error</DialogTitle>
            </DialogHeader>
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
          </>
        )}

        {state.kind === "ok" && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{state.story.title}</DialogTitle>
            </DialogHeader>
            <StoryView
              story={state.story}
              tasks={state.tasks}
              headerActions={
                <a
                  href={`/planning/stories/${state.story.id}`}
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
