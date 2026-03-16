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
  if (value === "") return -1;
  return options.findIndex((option) => option.value === value && !option.disabled);
}

export function getNextEnabledOptionIndex(
  options: readonly ThemedSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  const total = options.length;
  for (let step = 1; step <= total; step += 1) {
    const nextIndex = (currentIndex + direction * step + total) % total;
    if (!options[nextIndex]?.disabled) return nextIndex;
  }
  return -1;
}

export function getHighlightIndexForKey(
  options: readonly ThemedSelectOption[],
  currentIndex: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End",
): number | null {
  if (key === "ArrowDown") {
    return getNextEnabledOptionIndex(options, currentIndex, 1);
  }
  if (key === "ArrowUp") {
    return getNextEnabledOptionIndex(options, currentIndex, -1);
  }
  if (key === "Home") {
    return findFirstEnabledOptionIndex(options);
  }
  if (key === "End") {
    return findLastEnabledOptionIndex(options);
  }
  return null;
}

export function resolveInitialHighlightIndex(
  options: readonly ThemedSelectOption[],
  value: string,
): number {
  const selectedIndex = findSelectedEnabledOptionIndex(options, value);
  if (selectedIndex >= 0) return selectedIndex;
  return findFirstEnabledOptionIndex(options);
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
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const listboxId = React.useId();

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const isDisabled = disabled || options.length === 0;

  React.useEffect(() => {
    if (!open) return;
    setHighlightedIndex(resolveInitialHighlightIndex(options, value));
  }, [open, options, value]);

  const close = React.useCallback(() => {
    setOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const selectOption = React.useCallback(
    (option: ThemedSelectOption) => {
      if (option.disabled) return;
      onValueChange(option.value);
      close();
    },
    [close, onValueChange],
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const nextIndex = getHighlightIndexForKey(
        options,
        highlightedIndex === -1 ? resolveInitialHighlightIndex(options, value) : highlightedIndex,
        event.key,
      );
      if (nextIndex !== null) setHighlightedIndex(nextIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (highlightedIndex < 0 || highlightedIndex >= options.length) return;
      const option = options[highlightedIndex];
      if (!option || option.disabled) return;
      selectOption(option);
    }
  };

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
                const selected = option.value === value;
                const highlighted = index === highlightedIndex;
                const disabledOption = Boolean(option.disabled);
                const optionState: ThemedSelectRenderState = {
                  selected,
                  highlighted,
                  disabled: disabledOption,
                };

                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabledOption}
                    data-highlighted={highlighted || undefined}
                    className={cn(
                      "focus-ring flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      "text-foreground hover:bg-accent/70 hover:text-accent-foreground",
                      "data-[highlighted=true]:bg-accent/70 data-[highlighted=true]:text-accent-foreground",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                    onMouseEnter={() => {
                      if (disabledOption) return;
                      setHighlightedIndex(index);
                    }}
                    onClick={() => selectOption(option)}
                  >
                    <span className="min-w-0 grow truncate">
                      {renderOption ? renderOption(option, optionState) : option.label}
                    </span>
                    {selected ? (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    ) : null}
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
