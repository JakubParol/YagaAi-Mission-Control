"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFloatingMenu } from "@/hooks/use-floating-menu";
import { cn } from "@/lib/utils";

interface BacklogBoardActionsMenuProps {
  backlogName: string;
  canDelete: boolean;
  isDeleting: boolean;
  canMoveTop: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMoveBottom: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveBottom: () => void;
}

const MENU_ITEM_CLASS = cn(
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
  "text-foreground hover:bg-muted/50",
);

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={MENU_ITEM_CLASS}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function BacklogBoardActionsMenu({
  backlogName,
  canDelete,
  isDeleting,
  canMoveTop,
  canMoveUp,
  canMoveDown,
  canMoveBottom,
  onEdit,
  onDelete,
  onMoveTop,
  onMoveUp,
  onMoveDown,
  onMoveBottom,
}: BacklogBoardActionsMenuProps) {
  const { open, toggle, close, rootRef, menuRef, menuStyle } =
    useFloatingMenu();

  const hasMove = canMoveTop || canMoveUp || canMoveDown || canMoveBottom;

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Board actions for ${backlogName}`}
      style={menuStyle}
      className="z-40 min-w-36 rounded-md border border-border/70 bg-card p-1 shadow-xl"
    >
      <MenuItem
        icon={<Pencil className="size-3.5" />}
        label="Edit"
        onClick={() => {
          close();
          onEdit();
        }}
      />

      {hasMove && (
        <div className="my-1 border-t border-border/40" role="separator" />
      )}

      {canMoveTop && (
        <MenuItem
          icon={<ChevronsUp className="size-3.5" />}
          label="Move to top"
          onClick={() => {
            close();
            onMoveTop();
          }}
        />
      )}
      {canMoveUp && (
        <MenuItem
          icon={<ChevronUp className="size-3.5" />}
          label="Move up"
          onClick={() => {
            close();
            onMoveUp();
          }}
        />
      )}
      {canMoveDown && (
        <MenuItem
          icon={<ChevronDown className="size-3.5" />}
          label="Move down"
          onClick={() => {
            close();
            onMoveDown();
          }}
        />
      )}
      {canMoveBottom && (
        <MenuItem
          icon={<ChevronsDown className="size-3.5" />}
          label="Move to bottom"
          onClick={() => {
            close();
            onMoveBottom();
          }}
        />
      )}

      <div className="my-1 border-t border-border/40" role="separator" />

      <button
        type="button"
        role="menuitem"
        disabled={!canDelete || isDeleting}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
          "text-red-300 hover:bg-red-500/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        onClick={() => {
          if (!canDelete || isDeleting) return;
          close();
          onDelete();
        }}
      >
        {isDeleting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
        Delete
      </button>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isDeleting}
            aria-label={`Open board actions for ${backlogName}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={toggle}
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Board actions</TooltipContent>
      </Tooltip>

      {menu &&
        (typeof document !== "undefined"
          ? createPortal(menu, document.body)
          : menu)}
    </div>
  );
}
