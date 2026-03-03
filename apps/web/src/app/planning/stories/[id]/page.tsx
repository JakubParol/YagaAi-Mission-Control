"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { StoryForm } from "@/components/planning/story-form";
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
  const [reloadToken, setReloadToken] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

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
  }, [id, reloadToken]);

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
      {isEditing ? (
        <div className="rounded-md border border-border/40 bg-card/30 p-4">
          <StoryForm
            mode="edit"
            projectId={viewState.story.project_id}
            storyId={viewState.story.id}
            initialValues={{
              title: viewState.story.title,
              story_type: viewState.story.story_type,
              description: viewState.story.description ?? "",
              priority:
                viewState.story.priority !== null ? String(viewState.story.priority) : "",
              epic_id: viewState.story.epic_id ?? "",
              blocked_reason: viewState.story.blocked_reason ?? "",
            }}
            submitLabel="Save story"
            onSaved={() => {
              setIsEditing(false);
              setReloadToken((prev) => prev + 1);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <StoryView
          story={viewState.story}
          tasks={viewState.tasks}
          headerActions={
            <Button variant="outline" size="xs" onClick={() => setIsEditing(true)}>
              <Pencil className="size-3" />
              Edit
            </Button>
          }
        />
      )}
    </div>
  );
}
