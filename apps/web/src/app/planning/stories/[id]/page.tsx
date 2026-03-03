"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import {
  StoryView,
  type StoryDetail,
  type TaskItem,
} from "@/components/planning/story-view";

type PageState =
  | { kind: "loading"; forId: string }
  | { kind: "error"; forId: string; message: string }
  | { kind: "ok"; forId: string; story: StoryDetail; tasks: TaskItem[] };

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PageState>(() => ({
    kind: "loading",
    forId: id,
  }));

  const viewState: PageState =
    state.forId === id ? state : { kind: "loading", forId: id };

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    Promise.all([
      fetch(apiUrl(`/v1/planning/stories/${id}`)).then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      }),
      fetch(apiUrl(`/v1/planning/tasks?story_id=${id}&sort=priority`)).then((res) => {
        if (!res.ok) throw new Error(`Tasks API error: ${res.status}`);
        return res.json();
      }),
    ])
      .then(([storyJson, tasksJson]) => {
        if (!cancelled)
          setState({
            kind: "ok",
            forId: id,
            story: storyJson.data,
            tasks: tasksJson.data ?? [],
          });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", forId: id, message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (viewState.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (viewState.kind === "error") {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{viewState.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <StoryView story={viewState.story} tasks={viewState.tasks} />
    </div>
  );
}
