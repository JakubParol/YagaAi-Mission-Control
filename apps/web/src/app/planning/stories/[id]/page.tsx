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
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; story: StoryDetail; tasks: TaskItem[] };

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setState({ kind: "loading" });

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
          setState({ kind: "ok", story: storyJson.data, tasks: tasksJson.data ?? [] });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <StoryView story={state.story} tasks={state.tasks} />
    </div>
  );
}
