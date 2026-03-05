import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/lib/planning/types";
import { StoryCard, type StoryCardStory } from "./story-card";
import { StoryActionsMenu } from "./story-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ThemedSelect,
  type ThemedSelectOption,
} from "@/components/ui/themed-select";
import { AvatarOption } from "@/components/planning/avatar-option";
import { StoryTypeBadge } from "@/components/planning/story-type-badge";
import { AssigneeAvatarTooltip } from "@/components/planning/assignee-avatar-tooltip";
import {
  isQuickCreateCancelKey,
  isQuickCreateSubmitKey,
  validateQuickCreateSubject,
  type QuickCreateAssigneeOption,
  type QuickCreateSubmitInput,
  type QuickCreateWorkType,
} from "@/app/planning/board/quick-create";

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

const VALID_DROP_STATUSES = new Set<ItemStatus>([
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
]);

const QUICK_CREATE_TYPE_OPTIONS: ReadonlyArray<{ value: QuickCreateWorkType; label: string }> = [
  { value: "USER_STORY", label: "User Story" },
  { value: "TASK", label: "Task" },
  { value: "BUG", label: "Bug" },
];

const UNASSIGNED_OPTION = "__UNASSIGNED__";

export const TODO_QUICK_CREATE_LAYOUT = {
  controlsRow: "flex min-w-0 items-center gap-2",
  actionsRow: "flex w-full items-center justify-end gap-1",
} as const;

type AssigneePickerOption = ThemedSelectOption & {
  name: string;
  lastName: string | null;
  initials: string | null;
  role: string | null;
  avatar: string | null;
  isUnassigned?: boolean;
};

type StoryAssigneeSelection = {
  assignee_agent_id: string | null;
  assignee_name: string | null;
  assignee_last_name: string | null;
  assignee_initials: string | null;
  assignee_avatar: string | null;
};

function buildAssigneePickerOptions(
  assigneeOptions: readonly QuickCreateAssigneeOption[],
): AssigneePickerOption[] {
  return [
    {
      value: UNASSIGNED_OPTION,
      label: "Unassigned",
      name: "Unassigned",
      lastName: null,
      initials: null,
      role: null,
      avatar: null,
      isUnassigned: true,
    },
    ...assigneeOptions.map((option) => ({
      value: option.id,
      label: option.role ? `${option.name} · ${option.role}` : option.name,
      name: option.name,
      lastName: option.last_name,
      initials: option.initials,
      role: option.role,
      avatar: option.avatar,
    })),
  ];
}

function StoryAssigneeControl({
  storyId,
  currentAssignee,
  assigneeOptions,
  onChange,
  disabled = false,
}: {
  storyId: string;
  currentAssignee: StoryAssigneeSelection;
  assigneeOptions: readonly QuickCreateAssigneeOption[];
  onChange: (storyId: string, assignee: StoryAssigneeSelection) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerOptions = useMemo(
    () => buildAssigneePickerOptions(assigneeOptions),
    [assigneeOptions],
  );
  const selectedValue = currentAssignee.assignee_agent_id ?? UNASSIGNED_OPTION;
  const selectedName = currentAssignee.assignee_name ?? "Unassigned";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={disabled}
          aria-label={`Select assignee. Current assignee: ${selectedName}`}
          className="group/assignee relative"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AssigneeAvatarTooltip
            name={selectedName}
            lastName={currentAssignee.assignee_last_name}
            initials={currentAssignee.assignee_initials}
            avatar={currentAssignee.assignee_avatar}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[280px] p-2"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">
          Assignee
        </p>
        <ThemedSelect
          value={selectedValue}
          options={pickerOptions}
          placeholder="Select assignee"
          disabled={disabled}
          renderOption={(option) => {
            const assignee = option as AssigneePickerOption;
            if (assignee.isUnassigned) return "Unassigned";
            return (
              <AvatarOption
                name={assignee.name}
                lastName={assignee.lastName}
                initials={assignee.initials}
                role={assignee.role}
                avatar={assignee.avatar}
              />
            );
          }}
          renderValue={(option) => {
            const assignee = option as AssigneePickerOption;
            if (assignee.isUnassigned) return "Unassigned";
            return (
              <AvatarOption
                name={assignee.name}
                lastName={assignee.lastName}
                initials={assignee.initials}
                avatar={assignee.avatar}
                compact
              />
            );
          }}
          onValueChange={(value) => {
            const assignee = pickerOptions.find((option) => option.value === value);
            if (!assignee || assignee.isUnassigned) {
              onChange(storyId, {
                assignee_agent_id: null,
                assignee_name: null,
                assignee_last_name: null,
                assignee_initials: null,
                assignee_avatar: null,
              });
              setIsOpen(false);
              return;
            }
            onChange(storyId, {
              assignee_agent_id: String(assignee.value),
              assignee_name: assignee.name,
              assignee_last_name: assignee.lastName,
              assignee_initials: assignee.initials,
              assignee_avatar: assignee.avatar,
            });
            setIsOpen(false);
          }}
          triggerClassName="h-8 text-xs"
        />
      </PopoverContent>
    </Popover>
  );
}

function TodoQuickCreate({
  assigneeOptions,
  onTodoQuickCreate,
}: {
  assigneeOptions: readonly QuickCreateAssigneeOption[];
  onTodoQuickCreate: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
}) {
  const typeOptions = useMemo<ThemedSelectOption[]>(
    () => QUICK_CREATE_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const assigneePickerOptions = useMemo<AssigneePickerOption[]>(
    () => buildAssigneePickerOptions(assigneeOptions),
    [assigneeOptions],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [workType, setWorkType] = useState<QuickCreateWorkType>("USER_STORY");
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const selectedAssignee = useMemo(
    () => assigneeOptions.find((option) => option.id === assigneeAgentId) ?? null,
    [assigneeAgentId, assigneeOptions],
  );
  const selectedAssigneeName = selectedAssignee?.name ?? "Unassigned";

  const resetForm = () => {
    setSubject("");
    setWorkType("USER_STORY");
    setAssigneeAgentId(null);
    setErrorMessage(null);
  };

  const openForm = () => {
    setIsOpen(true);
    setErrorMessage(null);
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    setIsAssigneePickerOpen(false);
    resetForm();
    setIsOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validationMessage = validateQuickCreateSubject(subject);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onTodoQuickCreate({ subject, workType, assigneeAgentId });
      resetForm();
      setIsOpen(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create work item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (isQuickCreateCancelKey(event.key)) {
      event.preventDefault();
      handleCancel();
      return;
    }

    if (isQuickCreateSubmitKey(event.key, event.shiftKey)) {
      return;
    }
  };

  if (!isOpen) {
    return (
      <div className="px-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={openForm}
        >
          + Create
        </Button>
      </div>
    );
  }

  return (
    <div className="px-2 pt-2">
      <form
        className="rounded-md border border-border/60 bg-card/80 p-2"
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
      >
        <input
          ref={inputRef}
          value={subject}
          disabled={isSubmitting}
          placeholder="What needs to be done?"
          onChange={(event) => {
            setSubject(event.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus-ring"
          aria-label="Subject"
        />

        <div className="mt-2 grid min-w-0 gap-2">
          <div className={TODO_QUICK_CREATE_LAYOUT.controlsRow}>
            <ThemedSelect
              value={workType}
              options={typeOptions}
              placeholder="Work type"
              disabled={isSubmitting}
              renderOption={(option) => <StoryTypeBadge storyType={option.value} variant="badge" />}
              renderValue={(option) => (
                <StoryTypeBadge storyType={option.value} variant="badge" className="max-w-[124px]" />
              )}
              onValueChange={(value) => setWorkType(value as QuickCreateWorkType)}
              triggerClassName="h-8 min-w-[140px] px-2 text-xs"
              contentClassName="w-[220px]"
            />

            <Popover open={isAssigneePickerOpen} onOpenChange={setIsAssigneePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={isSubmitting}
                  aria-label={`Select assignee. Current assignee: ${selectedAssigneeName}`}
                  className="group/assignee relative"
                >
                  <AssigneeAvatarTooltip
                    name={selectedAssigneeName}
                    lastName={selectedAssignee?.last_name ?? null}
                    initials={selectedAssignee?.initials ?? null}
                    avatar={selectedAssignee?.avatar ?? null}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[280px] p-2">
                <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">
                  Assignee
                </p>
                <ThemedSelect
                  value={assigneeAgentId ?? UNASSIGNED_OPTION}
                  options={assigneePickerOptions}
                  placeholder="Select assignee"
                  disabled={isSubmitting}
                  renderOption={(option) => {
                    const assignee = option as AssigneePickerOption;
                    if (assignee.isUnassigned) return "Unassigned";
                    return (
                      <AvatarOption
                        name={assignee.name}
                        lastName={assignee.lastName}
                        initials={assignee.initials}
                        role={assignee.role}
                        avatar={assignee.avatar}
                      />
                    );
                  }}
                  renderValue={(option) => {
                    const assignee = option as AssigneePickerOption;
                    if (assignee.isUnassigned) return "Unassigned";
                    return (
                      <AvatarOption
                        name={assignee.name}
                        lastName={assignee.lastName}
                        initials={assignee.initials}
                        avatar={assignee.avatar}
                        compact
                      />
                    );
                  }}
                  onValueChange={(value) => {
                    setAssigneeAgentId(value === UNASSIGNED_OPTION ? null : value);
                    setIsAssigneePickerOpen(false);
                  }}
                  triggerClassName="h-8 text-xs"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className={TODO_QUICK_CREATE_LAYOUT.actionsRow}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={isSubmitting}
              onClick={handleCancel}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="xs"
              disabled={isSubmitting}
              className="min-w-[72px]"
            >
              {isSubmitting && <Loader2 className="size-3 animate-spin" />}
              Create
            </Button>
          </div>
        </div>

        {errorMessage && (
          <p className="mt-2 rounded-sm border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
            {errorMessage}
          </p>
        )}
      </form>
    </div>
  );
}

// ─── Board Column ───────────────────────────────────────────────────

function BoardColumn({
  status,
  label,
  accent,
  stories,
  isDropTarget,
  onDragOver,
  onDrop,
  onStoryClick,
  onCardDragStart,
  onCardDragEnd,
  pendingStoryIds,
  onStoryDelete,
  onStoryStatusChange,
  onTodoQuickCreate,
  assigneeOptions,
  assigneeOverrides,
  onStoryAssigneeChange,
}: {
  status: ItemStatus;
  label: string;
  accent: string;
  stories: StoryCardStory[];
  isDropTarget: boolean;
  onDragOver: (status: ItemStatus, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (status: ItemStatus, event: DragEvent<HTMLDivElement>) => void;
  onStoryClick?: (storyId: string) => void;
  onCardDragStart: (storyId: string) => void;
  onCardDragEnd: () => void;
  pendingStoryIds: Set<string>;
  onStoryDelete?: (storyId: string) => Promise<void> | void;
  onStoryStatusChange?: (storyId: string, status: ItemStatus) => void;
  onTodoQuickCreate?: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
  assigneeOptions: readonly QuickCreateAssigneeOption[];
  assigneeOverrides: Readonly<Record<string, StoryAssigneeSelection>>;
  onStoryAssigneeChange: (storyId: string, assignee: StoryAssigneeSelection) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border/40 bg-muted/20",
        "border-l-2",
        accent,
        isDropTarget && "ring-1 ring-blue-400/50 bg-blue-500/5",
      )}
      onDragOver={(event) => onDragOver(status, event)}
      onDrop={(event) => onDrop(status, event)}
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

      {status === "TODO" && onTodoQuickCreate && (
        <TodoQuickCreate assigneeOptions={assigneeOptions} onTodoQuickCreate={onTodoQuickCreate} />
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {stories.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[80px] text-[11px] text-muted-foreground/50">
            No stories
          </div>
        ) : (
          stories.map((story) => {
            const isPending = pendingStoryIds.has(story.id);
            const assignee = assigneeOverrides[story.id] ?? {
              assignee_agent_id: story.assignee_agent_id ?? null,
              assignee_name: story.assignee_name ?? null,
              assignee_last_name: story.assignee_last_name ?? null,
              assignee_initials: story.assignee_initials ?? null,
              assignee_avatar: story.assignee_avatar ?? null,
            };
            return (
              <StoryCard
                key={story.id}
                story={{
                  ...story,
                  assignee_agent_id: assignee.assignee_agent_id,
                  assignee_name: assignee.assignee_name,
                  assignee_last_name: assignee.assignee_last_name,
                  assignee_initials: assignee.assignee_initials,
                  assignee_avatar: assignee.assignee_avatar,
                }}
                onClick={onStoryClick}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                disabled={isPending}
                assigneeControl={(
                  <StoryAssigneeControl
                    storyId={story.id}
                    currentAssignee={assignee}
                    assigneeOptions={assigneeOptions}
                    disabled={isPending}
                    onChange={onStoryAssigneeChange}
                  />
                )}
                actions={
                  onStoryDelete ? (
                    <StoryActionsMenu
                      storyId={story.id}
                      storyType={story.story_type}
                      storyKey={story.key}
                      storyTitle={story.title}
                      storyStatus={story.status}
                      onDelete={onStoryDelete}
                      onStatusChange={onStoryStatusChange}
                      onAddLabel={onStoryClick}
                      disabled={isPending}
                      isDeleting={isPending}
                    />
                  ) : undefined
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Board ─────────────────────────────────────────────────────

export function SprintBoard({
  data,
  onStoryClick,
  onStoryStatusChange,
  onStoryAssigneeChange,
  onStoryDelete,
  pendingStoryIds,
  onTodoQuickCreate,
  assigneeOptions = [],
}: {
  data: ActiveSprintData;
  onStoryClick?: (storyId: string) => void;
  onStoryStatusChange?: (storyId: string, status: ItemStatus) => void;
  onStoryAssigneeChange?: (storyId: string, assigneeAgentId: string | null) => Promise<void>;
  onStoryDelete?: (storyId: string) => Promise<void> | void;
  pendingStoryIds?: ReadonlySet<string>;
  onTodoQuickCreate?: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
  assigneeOptions?: readonly QuickCreateAssigneeOption[];
}) {
  const [draggingStoryId, setDraggingStoryId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<ItemStatus | null>(null);
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, StoryAssigneeSelection>>({});
  const pendingSet = useMemo(() => new Set(pendingStoryIds ?? []), [pendingStoryIds]);

  const handleStoryAssigneeChange = (storyId: string, assignee: StoryAssigneeSelection) => {
    const story = data.stories.find((item) => item.id === storyId);
    const previousAssignee = assigneeOverrides[storyId] ?? {
      assignee_agent_id: story?.assignee_agent_id ?? null,
      assignee_name: story?.assignee_name ?? null,
      assignee_last_name: story?.assignee_last_name ?? null,
      assignee_initials: story?.assignee_initials ?? null,
      assignee_avatar: story?.assignee_avatar ?? null,
    };
    setAssigneeOverrides((prev) => ({ ...prev, [storyId]: assignee }));
    void onStoryAssigneeChange?.(storyId, assignee.assignee_agent_id ?? null).catch(() => {
      setAssigneeOverrides((prev) => ({
        ...prev,
        [storyId]: previousAssignee,
      }));
    });
  };

  const byStatus = useMemo(() => {
    const grouped = new Map<ItemStatus, StoryCardStory[]>();
    for (const col of COLUMNS) {
      grouped.set(col.status, []);
    }
    for (const story of data.stories) {
      const bucket = grouped.get(story.status);
      if (bucket) {
        bucket.push(story);
      }
    }
    return grouped;
  }, [data.stories]);

  const handleCardDragStart = (storyId: string) => {
    setDraggingStoryId(storyId);
  };

  const handleCardDragEnd = () => {
    setDraggingStoryId(null);
    setDropTargetStatus(null);
  };

  const handleDragOver = (status: ItemStatus, event: DragEvent<HTMLDivElement>) => {
    if (!draggingStoryId || pendingSet.has(draggingStoryId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetStatus !== status) {
      setDropTargetStatus(status);
    }
  };

  const handleDrop = (status: ItemStatus, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedStoryId = event.dataTransfer.getData("text/plain") || draggingStoryId;
    setDropTargetStatus(null);
    setDraggingStoryId(null);

    if (!draggedStoryId || pendingSet.has(draggedStoryId) || !VALID_DROP_STATUSES.has(status)) {
      return;
    }

    const draggedStory = data.stories.find((story) => story.id === draggedStoryId);
    if (!draggedStory || draggedStory.status === status) {
      return;
    }

    onStoryStatusChange?.(draggedStoryId, status);
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 overflow-x-auto">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.status}
            status={col.status}
            label={col.label}
            accent={col.accent}
            stories={byStatus.get(col.status) ?? []}
            isDropTarget={dropTargetStatus === col.status}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onStoryClick={onStoryClick}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            pendingStoryIds={pendingSet}
            onStoryDelete={onStoryDelete}
            onStoryStatusChange={onStoryStatusChange}
            onTodoQuickCreate={col.status === "TODO" ? onTodoQuickCreate : undefined}
            assigneeOptions={assigneeOptions}
            assigneeOverrides={assigneeOverrides}
            onStoryAssigneeChange={handleStoryAssigneeChange}
          />
        ))}
      </div>
    </div>
  );
}
