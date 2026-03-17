"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ThemedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ThemedSelectRenderState {
  selected: boolean;
  highlighted: boolean;
  disabled: boolean;
}

interface ThemedSelectProps {
  value: string;
  options: readonly ThemedSelectOption[];
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  emptyMessage?: string;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
  hideChevron?: boolean;
  onTriggerClick?: React.MouseEventHandler<HTMLButtonElement>;
  onTriggerPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  renderValue?: (option: ThemedSelectOption) => React.ReactNode;
  renderOption?: (
    option: ThemedSelectOption,
    state: ThemedSelectRenderState,
  ) => React.ReactNode;
  onValueChange: (value: string) => void;
}

export function stopThemedSelectEventPropagation(
  event: Pick<React.SyntheticEvent, "stopPropagation">,
): void {
  event.stopPropagation();
}

export function findFirstEnabledOptionIndex(options: readonly ThemedSelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

export function findLastEnabledOptionIndex(options: readonly ThemedSelectOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export function findSelectedEnabledOptionIndex(
  options: readonly ThemedSelectOption[],
  value: string,
): number {
  return value === "" ? -1 : options.findIndex((o) => o.value === value && !o.disabled);
}

export function getNextEnabledOptionIndex(
  options: readonly ThemedSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  const total = options.length;
  if (total === 0) return -1;
  for (let step = 1; step <= total; step += 1) {
    const idx = (currentIndex + direction * step + total) % total;
    if (!options[idx]?.disabled) return idx;
  }
  return -1;
}

export function getHighlightIndexForKey(
  options: readonly ThemedSelectOption[],
  currentIndex: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End",
): number | null {
  if (key === "ArrowDown") return getNextEnabledOptionIndex(options, currentIndex, 1);
  if (key === "ArrowUp") return getNextEnabledOptionIndex(options, currentIndex, -1);
  if (key === "Home") return findFirstEnabledOptionIndex(options);
  if (key === "End") return findLastEnabledOptionIndex(options);
  return null;
}

export function resolveInitialHighlightIndex(
  options: readonly ThemedSelectOption[],
  value: string,
): number {
  const idx = findSelectedEnabledOptionIndex(options, value);
  return idx >= 0 ? idx : findFirstEnabledOptionIndex(options);
}

const OPEN_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", " "]);
const NAV_KEYS = new Set<"ArrowDown" | "ArrowUp" | "Home" | "End">(["ArrowDown", "ArrowUp", "Home", "End"]);

function useSelectInteraction(
  options: readonly ThemedSelectOption[],
  value: string,
  isDisabled: boolean,
  onValueChange: (value: string) => void,
) {
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

  React.useEffect(() => {
    if (open) setHighlightedIndex(resolveInitialHighlightIndex(options, value));
  }, [open, options, value]);

  const close = React.useCallback(() => { setOpen(false); setHighlightedIndex(-1); }, []);

  const selectOption = React.useCallback(
    (option: ThemedSelectOption) => {
      if (!option.disabled) { onValueChange(option.value); close(); }
    },
    [close, onValueChange],
  );

  const handleTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      if (!open) {
        if (OPEN_KEYS.has(event.key)) { event.preventDefault(); setOpen(true); }
        return;
      }
      const navKey = event.key as "ArrowDown" | "ArrowUp" | "Home" | "End";
      if (NAV_KEYS.has(navKey)) {
        event.preventDefault();
        const base = highlightedIndex === -1 ? resolveInitialHighlightIndex(options, value) : highlightedIndex;
        const nextIndex = getHighlightIndexForKey(options, base, navKey);
        if (nextIndex !== null) setHighlightedIndex(nextIndex);
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = highlightedIndex >= 0 ? options[highlightedIndex] : undefined;
        if (option && !option.disabled) selectOption(option);
      }
    },
    [isDisabled, open, options, value, highlightedIndex, close, selectOption],
  );

  return { open, setOpen, highlightedIndex, setHighlightedIndex, selectOption, handleTriggerKeyDown };
}

/**
 * Reusable theme-aligned select for forms in Planning and other app surfaces.
 */
export function ThemedSelect({
  value,
  options,
  placeholder,
  disabled = false,
  invalid = false,
  emptyMessage = "No options available",
  ariaLabel,
  align = "start",
  hideChevron = false,
  onTriggerClick,
  onTriggerPointerDown,
  className,
  triggerClassName,
  contentClassName,
  renderValue,
  renderOption,
  onValueChange,
}: ThemedSelectProps) {
  const listboxId = React.useId();
  const isDisabled = disabled || options.length === 0;

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const { open, setOpen, highlightedIndex, setHighlightedIndex, selectOption, handleTriggerKeyDown } =
    useSelectInteraction(options, value, isDisabled, onValueChange);

  const activeDescendant =
    highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-activedescendant={open ? activeDescendant : undefined}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          disabled={isDisabled}
          data-state={open ? "open" : "closed"}
          className={cn(
            "focus-ring flex h-9 w-full items-center justify-between rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors",
            "hover:border-border disabled:cursor-not-allowed disabled:opacity-60",
            "data-[state=open]:border-primary/60 data-[state=open]:bg-accent/10",
            invalid && "border-destructive/70 text-destructive",
            triggerClassName,
          )}
          onClick={onTriggerClick}
          onPointerDown={onTriggerPointerDown}
          onKeyDown={handleTriggerKeyDown}
        >
          <span
            className={cn(
              "min-w-0 grow text-left",
              !selectedOption && "truncate text-muted-foreground",
            )}
          >
            {selectedOption
              ? (renderValue ? renderValue(selectedOption) : (
                <span className="truncate">{selectedOption.label}</span>
              ))
              : placeholder}
          </span>
          {hideChevron ? null : (
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground/80" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        onClick={stopThemedSelectEventPropagation}
        onPointerDown={stopThemedSelectEventPropagation}
        className={cn(
          "w-[var(--radix-popover-trigger-width)] p-1.5",
          "border-border/70 bg-popover/95 backdrop-blur-sm",
          className,
          contentClassName,
        )}
      >
        <div role="listbox" id={listboxId} aria-label={placeholder} className="max-h-64 overflow-auto">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="space-y-1">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightedIndex;
                const isOptionDisabled = Boolean(option.disabled);
                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={isOptionDisabled}
                    data-highlighted={isHighlighted || undefined}
                    className={cn(
                      "focus-ring flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      "text-foreground hover:bg-accent/70 hover:text-accent-foreground",
                      "data-[highlighted=true]:bg-accent/70 data-[highlighted=true]:text-accent-foreground",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                    onMouseEnter={() => !isOptionDisabled && setHighlightedIndex(index)}
                    onPointerDown={stopThemedSelectEventPropagation}
                    onClick={(e) => { stopThemedSelectEventPropagation(e); selectOption(option); }}
                  >
                    <span className="min-w-0 grow truncate">
                      {renderOption
                        ? renderOption(option, { selected: isSelected, highlighted: isHighlighted, disabled: isOptionDisabled })
                        : option.label}
                    </span>
                    {isSelected && <Check className="size-3.5 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
