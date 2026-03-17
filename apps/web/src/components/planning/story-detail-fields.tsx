"use client";

import { Calendar, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkItemDetail, WorkItemLabel } from "@/lib/planning/types";
import { StoryLabelManager } from "./story-detail-label-section";
import { TaskManager, type TaskManagerProps } from "./story-detail-task-section";
import {
  STORY_TYPE_OPTIONS,
  formatDate,
  formatDateTime,
  type EpicOption,
  type StoryDraft,
} from "./story-detail-view-model";

// ── SidebarField ────────────────────────────────────────────────────────────

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface StoryDetailFieldsProps {
  story: WorkItemDetail;
  storyDraft: StoryDraft;
  storyError: string | null;
  epics: EpicOption[];
  isLoadingEpics: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onDraftChange: (field: keyof StoryDraft, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  taskManagerProps: TaskManagerProps;
  labelManagerProps: {
    labels: WorkItemLabel[];
    availableLabels: WorkItemLabel[];
    selectedLabelId: string;
    isLoading: boolean;
    pendingLabelIds: ReadonlySet<string>;
    error: string | null;
    onSelectLabel: (labelId: string) => void;
    onAttachLabel: () => void;
    onDetachLabel: (labelId: string) => void;
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export function StoryDetailFields({
  story,
  storyDraft,
  storyError,
  epics,
  isLoadingEpics,
  isSaving,
  hasUnsavedChanges,
  onDraftChange,
  onSave,
  onCancel,
  taskManagerProps,
  labelManagerProps,
}: StoryDetailFieldsProps) {
  return (
    <>
      {/* Error banner */}
      {storyError && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          {storyError}
        </p>
      )}

      {/* Body: two-column layout */}
      <div className="flex items-start gap-5">
        {/* Left: description + tasks */}
        <div className="min-w-0 flex-[2] space-y-4">
          <div className="rounded-xl border border-border/30 bg-card/40 p-5 shadow-sm">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
              Intent
            </h3>
            <input
              id="story-detail-intent"
              value={storyDraft.summary}
              onChange={(event) => onDraftChange("summary", event.target.value)}
              placeholder="One-line goal or intent for this story\u2026"
              className="mb-4 w-full border-0 bg-transparent text-sm italic text-muted-foreground outline-none placeholder:text-muted-foreground/30 focus:ring-0"
            />
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
              Description
            </h3>
            <textarea
              id="story-detail-description"
              value={storyDraft.description}
              onChange={(event) => onDraftChange("description", event.target.value)}
              rows={12}
              placeholder="Describe the work, acceptance criteria, context\u2026"
              className="w-full resize-y border-0 bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/30 focus:ring-0"
            />
          </div>

          <div className="rounded-xl border border-border/30 bg-card/40 p-5 shadow-sm">
            <TaskManager {...taskManagerProps} />
          </div>
        </div>

        {/* Right: properties sidebar */}
        <div className="w-64 flex-none space-y-4 rounded-xl border border-border/30 bg-card/40 p-5 shadow-sm">
          <SidebarField label="Type">
            <select
              id="story-detail-type"
              value={storyDraft.sub_type}
              onChange={(event) => onDraftChange("sub_type", event.target.value)}
              className="h-8 w-full rounded-lg border border-border/50 bg-background/60 px-2.5 text-sm text-foreground focus-ring"
            >
              {STORY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SidebarField>

          <SidebarField label="Priority">
            <input
              id="story-detail-priority"
              type="number"
              min={0}
              value={storyDraft.priority}
              onChange={(event) => onDraftChange("priority", event.target.value)}
              placeholder="\u2014"
              className="h-8 w-full rounded-lg border border-border/50 bg-background/60 px-2.5 text-sm text-foreground focus-ring placeholder:text-muted-foreground/40"
            />
          </SidebarField>

          <SidebarField label="Epic">
            <select
              id="story-detail-epic"
              value={storyDraft.parent_id}
              disabled={isLoadingEpics}
              onChange={(event) => onDraftChange("parent_id", event.target.value)}
              className="h-8 w-full rounded-lg border border-border/50 bg-background/60 px-2.5 text-sm text-foreground focus-ring"
            >
              <option value="">No epic</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.key ? `${epic.key} ${epic.title}` : epic.title}
                </option>
              ))}
            </select>
          </SidebarField>

          <div id="story-detail-labels" className="border-t border-border/20 pt-4">
            <StoryLabelManager {...labelManagerProps} />
          </div>

          <div className="space-y-1.5 border-t border-border/20 pt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
              Blocked reason
            </span>
            <textarea
              id="story-detail-blocked-reason"
              value={storyDraft.blocked_reason}
              onChange={(event) => onDraftChange("blocked_reason", event.target.value)}
              rows={2}
              placeholder="Leave empty if not blocked."
              className="w-full resize-none rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="space-y-2 border-t border-border/20 pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5 shrink-0" />
              Created {formatDate(story.created_at) ?? "\u2014"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" />
              Updated {formatDateTime(story.updated_at) ?? "\u2014"}
            </span>
            {story.started_at && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" />
                Started {formatDate(story.started_at)}
              </span>
            )}
            {story.completed_at && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                Completed {formatDate(story.completed_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Save / Cancel */}
      <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasUnsavedChanges}
          onClick={onCancel}
        >
          Discard changes
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={onSave}
        >
          {isSaving && <Loader2 className="size-3 animate-spin" />}
          Save changes
        </Button>
      </div>
    </>
  );
}
