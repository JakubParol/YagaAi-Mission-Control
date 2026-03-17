"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ChevronRight,
  Copy,
  Flag,
  Link2,
  ListMinus,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkItemStatus } from "@/lib/planning/types";
import {
  calculateMainMenuCoordinates,
  calculateSubmenuCoordinates,
  hasSameCoordinates,
  type FloatingCoordinates,
} from "./story-actions-menu-positioning";
import {
  isStoryActionsSupportedType,
  reduceDeleteConfirmPhase,
  STORY_STATUS_ORDER,
  type DeleteConfirmPhase,
  type MainAction,
  type MenuActionItem,
  type StoryActionsMenuProps,
} from "./story-actions-menu-types";
import { MainMenuPanel, StatusSubmenuPanel } from "./story-actions-menu-panel";
import { StoryDeleteConfirmDialog } from "./story-delete-confirm-dialog";

export {
  isStoryActionsSupportedType,
  reduceDeleteConfirmPhase,
  STORY_ACTIONS_SUPPORTED_TYPES,
  STORY_STATUS_ORDER,
} from "./story-actions-menu-types";
export type { DeleteConfirmPhase, DeleteConfirmEvent } from "./story-actions-menu-types";
export {
  calculateMainMenuCoordinates,
  calculateSubmenuCoordinates,
} from "./story-actions-menu-positioning";

function getStoryLinkUrl(storyId: string): string {
  if (typeof window === "undefined") return `/planning/stories/${storyId}`;
  return new URL(`/planning/stories/${storyId}`, window.location.origin).toString();
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") return;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export function StoryActionsMenu({
  storyId, storyType, storyKey, storyTitle, storyStatus,
  onDelete, onStatusChange, onAddLabel, sprintMembershipAction,
  disabled = false, isDeleting = false, defaultOpen = false,
  defaultConfirmOpen = false, defaultStatusSubmenuOpen = false,
}: StoryActionsMenuProps) {
  const isSupportedType = isStoryActionsSupportedType(storyType);
  const [isClient, setIsClient] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [statusSubmenuOpen, setStatusSubmenuOpen] = useState(defaultStatusSubmenuOpen);
  const [activeZone, setActiveZone] = useState<"main" | "status">("main");
  const [activeMainIdx, setActiveMainIdx] = useState(0);
  const [activeStatusIdx, setActiveStatusIdx] = useState(0);
  const [menuCoords, setMenuCoords] = useState<FloatingCoordinates | null>(null);
  const [subCoords, setSubCoords] = useState<FloatingCoordinates | null>(null);
  const [confirmPhase, setConfirmPhase] = useState<DeleteConfirmPhase>(
    defaultConfirmOpen ? "open" : "closed",
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const mainRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const statusRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isDisabled = disabled || isDeleting;
  const storyLabel = storyKey ? `${storyKey} ${storyTitle}` : storyTitle;

  const mainActions = useMemo<MenuActionItem[]>(() => [
    { id: "copy-link", label: "Copy link", icon: Copy, disabled: isDisabled },
    { id: "copy-key", label: "Copy key", icon: Copy, disabled: isDisabled || !storyKey },
    { id: "add-label", label: "Add label", icon: Tag, disabled: isDisabled },
    ...(sprintMembershipAction ? [{
      id: "toggle-sprint-membership" as const,
      label: sprintMembershipAction.mode === "add" ? "Add to active sprint" : "Remove from active sprint",
      icon: sprintMembershipAction.mode === "add" ? ListPlus : ListMinus,
      disabled: isDisabled || Boolean(sprintMembershipAction.disabled),
    }] : []),
    { id: "change-status", label: "Change status", icon: ChevronRight, disabled: isDisabled || !onStatusChange, submenu: true },
    { id: "add-flag", label: "Add flag", icon: Flag, disabled: true },
    { id: "link-work-item", label: "Link work item", icon: Link2, disabled: true },
    { id: "link-parent", label: "Link parent", icon: Link2, disabled: true },
    { id: "archive", label: "Archive", icon: Archive, disabled: true },
    { id: "delete", label: "Delete", icon: Trash2, disabled: isDisabled, tone: "danger" },
  ], [isDisabled, onStatusChange, sprintMembershipAction, storyKey]);

  const enabledMainIdxs = useMemo(() => mainActions.flatMap((a, i) => (a.disabled ? [] : [i])), [mainActions]);
  const statusOptions = useMemo(
    () => STORY_STATUS_ORDER.map((s) => ({ status: s, disabled: isDisabled || !onStatusChange || storyStatus === s })),
    [isDisabled, onStatusChange, storyStatus],
  );
  const enabledStatusIdxs = useMemo(() => statusOptions.flatMap((o, i) => (o.disabled ? [] : [i])), [statusOptions]);

  useEffect(() => { setIsClient(true); }, []);

  const updatePositions = useCallback(() => {
    if (typeof window === "undefined" || !open || !rootRef.current) return;
    if (!menuRef.current) { setMenuCoords(null); setSubCoords(null); return; }
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const trigger = rootRef.current.getBoundingClientRect();
    const nextMenu = calculateMainMenuCoordinates(
      trigger, { width: menuRef.current.offsetWidth, height: menuRef.current.offsetHeight }, vp,
    );
    setMenuCoords((c) => (hasSameCoordinates(c, nextMenu) ? c : nextMenu));
    if (!statusSubmenuOpen || !menuRef.current || !submenuRef.current) { setSubCoords(null); return; }
    const csIdx = mainActions.findIndex((a) => a.id === "change-status");
    const anchor = mainRefs.current[csIdx]?.getBoundingClientRect() ?? menuRef.current.getBoundingClientRect();
    const nextSub = calculateSubmenuCoordinates(
      anchor, menuRef.current.getBoundingClientRect(),
      { width: submenuRef.current.offsetWidth, height: submenuRef.current.offsetHeight }, vp,
    );
    setSubCoords((c) => (hasSameCoordinates(c, nextSub) ? c : nextSub));
  }, [mainActions, open, statusSubmenuOpen]);

  useEffect(() => {
    if (!open) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (!(rootRef.current?.contains(t) ?? false) && !(menuRef.current?.contains(t) ?? false) && !(submenuRef.current?.contains(t) ?? false)) {
        setOpen(false); setStatusSubmenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (statusSubmenuOpen) { setStatusSubmenuOpen(false); setActiveZone("main"); return; }
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPtr);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onPtr); window.removeEventListener("keydown", onKey); };
  }, [open, statusSubmenuOpen]);

  useEffect(() => {
    if (!open) return;
    const idx = enabledMainIdxs[0] ?? 0;
    setActiveMainIdx(idx); setStatusSubmenuOpen(false); setActiveZone("main");
    queueMicrotask(() => mainRefs.current[idx]?.focus());
  }, [enabledMainIdxs, open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePositions();
    const h = () => updatePositions();
    window.addEventListener("resize", h); window.addEventListener("scroll", h, true);
    return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); };
  }, [open, updatePositions]);

  useLayoutEffect(() => {
    if (!open) { setMenuCoords(null); setSubCoords(null); return; }
    updatePositions();
  }, [open, statusSubmenuOpen, activeMainIdx, activeStatusIdx, updatePositions]);

  const focusMain = (i: number) => { setActiveMainIdx(i); setActiveZone("main"); queueMicrotask(() => mainRefs.current[i]?.focus()); };
  const focusStatus = (i: number) => { setActiveStatusIdx(i); setActiveZone("status"); queueMicrotask(() => statusRefs.current[i]?.focus()); };
  const closeMenu = () => { setOpen(false); setStatusSubmenuOpen(false); };
  const openStatusSub = () => {
    if (!onStatusChange || enabledStatusIdxs.length === 0) return;
    setStatusSubmenuOpen(true); focusStatus(enabledStatusIdxs[0] ?? 0);
  };
  const cycleIdx = (enabled: number[], current: number, d: 1 | -1) => {
    const ci = enabled.indexOf(current);
    return enabled[(Math.max(ci, 0) + d + enabled.length) % enabled.length]!;
  };

  const handleMainAction = async (actionId: MainAction) => {
    if (actionId === "change-status") { openStatusSub(); return; }
    if (actionId === "delete") { if (!isDisabled) { closeMenu(); setConfirmPhase((p) => reduceDeleteConfirmPhase(p, "OPEN")); } return; }
    if (actionId === "toggle-sprint-membership") { if (sprintMembershipAction && !isDisabled) { await sprintMembershipAction.onSelect(storyId); closeMenu(); } return; }
    if (actionId === "copy-link") { await writeClipboard(getStoryLinkUrl(storyId)); closeMenu(); return; }
    if (actionId === "copy-key") { if (storyKey) await writeClipboard(storyKey); closeMenu(); return; }
    if (actionId === "add-label") { onAddLabel?.(storyId); closeMenu(); }
  };
  const handleStatusAction = async (status: WorkItemStatus) => {
    if (!onStatusChange || status === storyStatus || isDisabled) return;
    await onStatusChange(storyId, status); closeMenu();
  };
  const handleConfirmDelete = async () => {
    if (isDisabled || confirmPhase === "submitting") return;
    setConfirmPhase((p) => reduceDeleteConfirmPhase(p, "CONFIRM"));
    try { await onDelete(storyId); } finally { setConfirmPhase((p) => reduceDeleteConfirmPhase(p, "FINISH")); }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Tab") { closeMenu(); return; }
    if (activeZone === "main") {
      if (event.key === "ArrowDown") { event.preventDefault(); focusMain(cycleIdx(enabledMainIdxs, activeMainIdx, 1)); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); focusMain(cycleIdx(enabledMainIdxs, activeMainIdx, -1)); return; }
      if (event.key === "ArrowRight") { if (mainActions[activeMainIdx]?.id === "change-status") { event.preventDefault(); openStatusSub(); } return; }
      if (event.key === "Enter" || event.key === " ") { const a = mainActions[activeMainIdx]; if (!a || a.disabled) return; event.preventDefault(); void handleMainAction(a.id); return; }
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); focusStatus(cycleIdx(enabledStatusIdxs, activeStatusIdx, 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); focusStatus(cycleIdx(enabledStatusIdxs, activeStatusIdx, -1)); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); setStatusSubmenuOpen(false); setActiveZone("main"); queueMicrotask(() => mainRefs.current[activeMainIdx]?.focus()); return; }
    if (event.key === "Enter" || event.key === " ") { const o = statusOptions[activeStatusIdx]; if (!o || o.disabled) return; event.preventDefault(); void handleStatusAction(o.status); return; }
    if (event.key === "Escape") { event.preventDefault(); setStatusSubmenuOpen(false); setActiveZone("main"); queueMicrotask(() => mainRefs.current[activeMainIdx]?.focus()); }
  };

  if (!isSupportedType) return null;

  const menu = open ? (
    <MainMenuPanel menuRef={menuRef} storyLabel={storyLabel} mainActions={mainActions}
      mainActionRefs={mainRefs} menuCoordinates={menuCoords} onKeyDown={handleMenuKeyDown}
      onActionClick={(id) => void handleMainAction(id as MainAction)}
      onActionHover={(i) => { setActiveMainIdx(i); setActiveZone("main"); }} />
  ) : null;
  const submenu = open && statusSubmenuOpen ? (
    <StatusSubmenuPanel submenuRef={submenuRef} statusOptions={statusOptions} storyStatus={storyStatus}
      statusActionRefs={statusRefs} submenuCoordinates={subCoords} onKeyDown={handleMenuKeyDown}
      onStatusClick={(s) => void handleStatusAction(s)}
      onStatusHover={(i) => { setActiveStatusIdx(i); setActiveZone("status"); }} />
  ) : null;

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <Button type="button" variant="ghost" size="icon-xs" disabled={isDisabled}
        aria-label={`Open story actions for ${storyLabel}`} className="text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((p) => !p)}>
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
      </Button>
      {menu && (isClient ? createPortal(menu, document.body) : menu)}
      {submenu && (isClient ? createPortal(submenu, document.body) : submenu)}
      <StoryDeleteConfirmDialog storyLabel={storyLabel} confirmPhase={confirmPhase}
        onPhaseChange={setConfirmPhase} onConfirmDelete={() => void handleConfirmDelete()} />
    </div>
  );
}
