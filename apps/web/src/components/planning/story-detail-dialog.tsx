"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Clock,
  ListTodo,
  Loader2,
  ShieldAlert,
} from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STATUS_STYLE,
  STATUS_LABEL,
  TYPE_CONFIG,
} from "./story-card";

// ─── Types (matches API StoryDetailResponse) ────────────────────────

interface StoryDetail {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: ItemStatus;
  status_mode: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  task_count: number;
}

type DialogState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; story: StoryDetail };

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function PriorityLabel({ priority }: { priority: number | null }) {
  if (priority === null) return <span className="text-muted-foreground">—</span>;
  if (priority <= 2) return <span className="text-red-400 font-medium">Critical ({priority})</span>;
  if (priority <= 4) return <span className="text-amber-400 font-medium">High ({priority})</span>;
  if (priority <= 6) return <span className="text-slate-300">Medium ({priority})</span>;
  return <span className="text-blue-400">Low ({priority})</span>;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-b-0">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </span>
      <div className="text-sm text-foreground min-w-0">{children}</div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

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

    fetch(apiUrl(`/v1/planning/stories/${storyId}`))
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setState({ kind: "ok", story: json.data });
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
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
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

        {state.kind === "ok" && <StoryContent story={state.story} />}
      </DialogContent>
    </Dialog>
  );
}

function StoryContent({ story }: { story: StoryDetail }) {
  const statusStyle = STATUS_STYLE[story.status];
  const typeConf = TYPE_CONFIG[story.story_type] ?? TYPE_CONFIG.USER_STORY;
  const TypeIcon = typeConf.icon;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">
            {story.key ?? "—"}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              statusStyle.bg,
              statusStyle.text,
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
            {STATUS_LABEL[story.status]}
          </span>
        </div>
        <DialogTitle className="text-xl">{story.title}</DialogTitle>
        {story.intent && (
          <DialogDescription className="text-sm italic">
            {story.intent}
          </DialogDescription>
        )}
      </DialogHeader>

      {/* Blocked banner */}
      {story.is_blocked && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <ShieldAlert className="size-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Blocked</span>
            {story.blocked_reason && (
              <span className="text-red-400/80"> — {story.blocked_reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {story.description && (
        <div className="rounded-md border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {story.description}
          </p>
        </div>
      )}

      {/* Metadata grid */}
      <div className="space-y-0">
        <MetaRow label="Type">
          <span className={cn("flex items-center gap-1.5", typeConf.color)}>
            <TypeIcon className="size-3.5" />
            {typeConf.label}
          </span>
        </MetaRow>

        <MetaRow label="Priority">
          <PriorityLabel priority={story.priority} />
        </MetaRow>

        <MetaRow label="Tasks">
          <span className="flex items-center gap-1.5">
            <ListTodo className="size-3.5 text-muted-foreground" />
            {story.task_count} {story.task_count === 1 ? "task" : "tasks"}
          </span>
        </MetaRow>

        <MetaRow label="Status mode">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {story.status_mode}
          </Badge>
        </MetaRow>

        <MetaRow label="Created">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3.5" />
            {formatDate(story.created_at)}
          </span>
        </MetaRow>

        {story.started_at && (
          <MetaRow label="Started">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" />
              {formatDateTime(story.started_at)}
            </span>
          </MetaRow>
        )}

        {story.completed_at && (
          <MetaRow label="Completed">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Clock className="size-3.5" />
              {formatDateTime(story.completed_at)}
            </span>
          </MetaRow>
        )}

        <MetaRow label="Updated">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            {formatDateTime(story.updated_at)}
          </span>
        </MetaRow>
      </div>
    </>
  );
}
