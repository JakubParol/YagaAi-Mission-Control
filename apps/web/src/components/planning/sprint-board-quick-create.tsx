import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
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

// ─── Layout constants (tested in sprint-board-layout.test.ts) ────────

export const TODO_QUICK_CREATE_LAYOUT = {
  controlsRow: "flex min-w-0 items-center gap-2",
  actionsRow: "flex w-full items-center justify-end gap-1",
} as const;

// ─── Config & helpers ────────────────────────────────────────────────

const QUICK_CREATE_TYPE_OPTIONS: ReadonlyArray<ThemedSelectOption> = [
  { value: "USER_STORY", label: "User Story" },
  { value: "TASK", label: "Task" },
  { value: "BUG", label: "Bug" },
];

const UNASSIGNED_OPTION = "__UNASSIGNED__";

type AssigneePickerOption = ThemedSelectOption & {
  name: string; lastName: string | null; initials: string | null;
  role: string | null; avatar: string | null; isUnassigned?: boolean;
};

const UNASSIGNED_PICKER_OPTION: AssigneePickerOption = {
  value: UNASSIGNED_OPTION, label: "Unassigned", name: "Unassigned",
  lastName: null, initials: null, role: null, avatar: null, isUnassigned: true,
};

function buildAssigneePickerOptions(
  assigneeOptions: readonly QuickCreateAssigneeOption[],
): AssigneePickerOption[] {
  return [UNASSIGNED_PICKER_OPTION, ...assigneeOptions.map((o) => ({
    value: o.id, label: o.role ? `${o.name} · ${o.role}` : o.name,
    name: o.name, lastName: o.last_name, initials: o.initials,
    role: o.role, avatar: o.avatar,
  }))];
}

function renderAssigneeOption(option: ThemedSelectOption) {
  const a = option as AssigneePickerOption;
  if (a.isUnassigned) return "Unassigned";
  return <AvatarOption name={a.name} lastName={a.lastName} initials={a.initials} role={a.role} avatar={a.avatar} />;
}

function renderAssigneeValue(option: ThemedSelectOption) {
  const a = option as AssigneePickerOption;
  if (a.isUnassigned) return "Unassigned";
  return <AvatarOption name={a.name} lastName={a.lastName} initials={a.initials} avatar={a.avatar} compact />;
}

// ─── Component ───────────────────────────────────────────────────────

export interface TodoQuickCreateProps {
  assigneeOptions: readonly QuickCreateAssigneeOption[];
  onTodoQuickCreate: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
}

export function TodoQuickCreate({
  assigneeOptions,
  onTodoQuickCreate,
}: TodoQuickCreateProps) {
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
              options={QUICK_CREATE_TYPE_OPTIONS}
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
                  renderOption={renderAssigneeOption}
                  renderValue={renderAssigneeValue}
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
