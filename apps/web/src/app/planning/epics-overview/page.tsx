"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Radar,
  ShieldAlert,
  TimerReset,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/ui/themed-select";
import { apiUrl } from "@/lib/api-client";
import type { EpicStatus, ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import {
  applyClientEpicOverviewFilters,
  applyStoryPreviewFilters,
  buildEpicOverviewStats,
  toPercentLabel,
  toStoriesLabel,
  toStoryPreviewAssignee,
  toStoryPreviewTitle,
  toStoryPreviewUpdatedAt,
} from "./overview-view-model";
import {
  EPIC_OVERVIEW_DEFAULT_FILTERS,
  EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS,
  EPIC_OVERVIEW_PRESETS,
  EPIC_OVERVIEW_SORT_OPTIONS,
  type EpicOverviewAgent,
  type EpicOverviewFilters,
  type EpicOverviewItem,
  type EpicOverviewLabel,
  type EpicOverviewListEnvelope,
  type EpicOverviewStoryPreview,
  type EpicOverviewStoryPreviewFilters,
} from "./overview-types";

const FILTER_KEYS = {
  search: "q",
  status: "status",
  ownerId: "owner",
  label: "label",
  blocked: "blocked",
  sort: "sort",
  preset: "preset",
} as const;

type PresetKey = "all" | "at-risk" | "near-done";

interface AgentListEnvelope {
  data?: Array<{
    id?: string;
    name?: string;
    last_name?: string | null;
  }>;
}

interface LabelListEnvelope {
  data?: Array<{
    name?: string;
  }>;
}

interface StoryListEnvelope {
  data?: Array<{
    id?: string;
    key?: string | null;
    title?: string;
    status?: string;
    current_assignee_agent_id?: string | null;
    is_blocked?: boolean;
    updated_at?: string;
  }>;
}

interface BulkOperationEnvelope {
  data?: {
    results?: Array<{
      entity_id?: string;
      success?: boolean;
      timestamp?: string;
      error_code?: string | null;
      error_message?: string | null;
    }>;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface FetchResult {
  rows: EpicOverviewItem[];
  agents: EpicOverviewAgent[];
  labels: EpicOverviewLabel[];
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: EpicOverviewItem[]; agents: EpicOverviewAgent[]; labels: EpicOverviewLabel[] };

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; stories: EpicOverviewStoryPreview[] };

function parseEpicStatus(value: string | null): EpicStatus | "" {
  if (value === "TODO" || value === "IN_PROGRESS" || value === "DONE") return value;
  return "";
}

function parseItemStatus(value: string | null | undefined): ItemStatus | null {
  if (value === "TODO" || value === "IN_PROGRESS" || value === "CODE_REVIEW" || value === "VERIFY" || value === "DONE") {
    return value;
  }
  return null;
}

function parseBlocked(value: string | null): EpicOverviewFilters["blocked"] {
  if (value === "true" || value === "false") return value;
  return "";
}

function parsePreset(value: string | null): PresetKey {
  if (value === "at-risk" || value === "near-done") return value;
  return "all";
}

function parseSort(value: string | null): EpicOverviewFilters["sort"] {
  const allowed = new Set(EPIC_OVERVIEW_SORT_OPTIONS.map((item) => item.value));
  if (value && allowed.has(value as EpicOverviewFilters["sort"])) {
    return value as EpicOverviewFilters["sort"];
  }
  return EPIC_OVERVIEW_DEFAULT_FILTERS.sort;
}

function isShortcutInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}

function getAdjacentEpicKey(epicKeys: readonly string[], currentKey: string | null, step: number): string | null {
  if (epicKeys.length === 0) return null;
  if (!currentKey) return epicKeys[0];
  const index = epicKeys.indexOf(currentKey);
  if (index < 0) return epicKeys[0];
  const nextIndex = Math.max(0, Math.min(epicKeys.length - 1, index + step));
  return epicKeys[nextIndex] ?? epicKeys[0];
}

function statusVariant(status: EpicStatus): "outline" | "secondary" | "default" {
  if (status === "DONE") return "default";
  if (status === "IN_PROGRESS") return "secondary";
  return "outline";
}

function storyStatusVariant(status: ItemStatus): "outline" | "secondary" | "default" {
  if (status === "DONE") return "default";
  if (status === "IN_PROGRESS") return "secondary";
  if (status === "CODE_REVIEW" || status === "VERIFY") return "secondary";
  return "outline";
}

function resolveAgentLabel(agent: { id?: string; name?: string; last_name?: string | null }): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted/50" role="presentation">
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function StoryBlockedBadge({ blocked }: { blocked: boolean }) {
  if (blocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
        <AlertTriangle className="size-3" />
        blocked
      </span>
    );
  }
  return <span className="text-[10px] text-emerald-300">ok</span>;
}

async function parseApiErrorPayload(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    return {
      code: payload.error?.code,
      message: payload.error?.message,
    };
  } catch {
    return {};
  }
}

export async function toActionHttpErrorMessage(
  response: Response,
  action: "status" | "add-to-sprint",
): Promise<string> {
  const payload = await parseApiErrorPayload(response);
  const code = payload.code;
  const message = payload.message;

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to perform this action.";
  }
  if (code === "FORBIDDEN") {
    return "You do not have permission to perform this action.";
  }
  if (code === "UNPROCESSABLE_ENTITY") {
    return action === "status"
      ? "Status update request is invalid. Refresh and try again."
      : "Add-to-sprint request is invalid. Refresh and try again.";
  }
  if (code === "VALIDATION_ERROR") {
    return action === "add-to-sprint"
      ? "Select a single project before adding a story to sprint."
      : "Status update validation failed.";
  }
  if (message && message.trim().length > 0) {
    return message;
  }
  return action === "status"
    ? `Failed to update story status. HTTP ${response.status}.`
    : `Failed to add story to sprint. HTTP ${response.status}.`;
}

export function toBulkResultErrorMessage(
  result: { error_code?: string | null; error_message?: string | null },
  action: "status" | "add-to-sprint",
): string {
  if (result.error_message && result.error_message.trim().length > 0) {
    return result.error_message;
  }

  if (result.error_code === "UNAUTHORIZED") {
    return "Authentication is required to perform this action.";
  }
  if (result.error_code === "FORBIDDEN") {
    return "You do not have permission to perform this action.";
  }
  if (result.error_code === "UNPROCESSABLE_ENTITY") {
    return action === "status"
      ? "Status update request is invalid. Refresh and try again."
      : "Add-to-sprint request is invalid. Refresh and try again.";
  }
  if (result.error_code === "NO_ACTIVE_SPRINT") {
    return "No active sprint is available for this project.";
  }
  if (result.error_code === "BUSINESS_RULE_VIOLATION") {
    return action === "status"
      ? "Story status cannot be changed in the current state."
      : "Story cannot be added to active sprint from its current backlog.";
  }

  return action === "status"
    ? "Failed to update story status."
    : "Failed to add story to sprint.";
}

function EpicOverviewPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "no-project" });
  const [expandedByEpicKey, setExpandedByEpicKey] = useState<Record<string, boolean>>({});
  const [previewByEpicKey, setPreviewByEpicKey] = useState<Record<string, PreviewState>>({});
  const [previewFiltersByEpicKey, setPreviewFiltersByEpicKey] = useState<
    Record<string, EpicOverviewStoryPreviewFilters>
  >({});
  const [storyPendingById, setStoryPendingById] = useState<Record<string, boolean>>({});
  const [storyErrorByEpicKey, setStoryErrorByEpicKey] = useState<Record<string, string>>({});
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const singleProjectId = !allSelected && selectedProjectIds.length === 1
    ? selectedProjectIds[0]
    : null;

  const filters = useMemo<EpicOverviewFilters>(() => ({
    search: searchParams.get(FILTER_KEYS.search) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.search,
    status: parseEpicStatus(searchParams.get(FILTER_KEYS.status)),
    ownerId: searchParams.get(FILTER_KEYS.ownerId) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.ownerId,
    label: searchParams.get(FILTER_KEYS.label) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.label,
    blocked: parseBlocked(searchParams.get(FILTER_KEYS.blocked)),
    sort: parseSort(searchParams.get(FILTER_KEYS.sort)),
  }), [searchParams]);

  const preset = parsePreset(searchParams.get(FILTER_KEYS.preset));

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim().length === 0) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const applyPreset = useCallback((nextPreset: PresetKey) => {
    const presetConfig = EPIC_OVERVIEW_PRESETS.find((item) => item.key === nextPreset);
    if (!presetConfig) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set(FILTER_KEYS.preset, nextPreset);

    const merged: EpicOverviewFilters = {
      ...filters,
      ...presetConfig.overrides,
    };

    if (merged.blocked.length === 0) params.delete(FILTER_KEYS.blocked);
    else params.set(FILTER_KEYS.blocked, merged.blocked);

    if (merged.status.length === 0) params.delete(FILTER_KEYS.status);
    else params.set(FILTER_KEYS.status, merged.status);

    params.set(FILTER_KEYS.sort, merged.sort);

    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [filters, pathname, router, searchParams]);

  const fetchOverview = useCallback(async (projectId: string): Promise<FetchResult> => {
    const overviewParams = new URLSearchParams();
    overviewParams.set("project_id", projectId);
    overviewParams.set("limit", "100");
    overviewParams.set("sort", filters.sort);

    if (filters.search.trim().length > 0) overviewParams.set("text", filters.search.trim());
    if (filters.status.length > 0) overviewParams.set("status", filters.status);
    if (filters.ownerId.length > 0) overviewParams.set("owner", filters.ownerId);
    if (filters.label.trim().length > 0) overviewParams.set("label", filters.label.trim());
    if (filters.blocked.length > 0) overviewParams.set("is_blocked", filters.blocked);

    const [overviewRes, agentsRes, labelsRes] = await Promise.all([
      fetch(apiUrl(`/v1/planning/epics/overview?${overviewParams.toString()}`)),
      fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name")),
      fetch(apiUrl(`/v1/planning/labels?project_id=${projectId}&limit=100&sort=name`)),
    ]);

    if (!overviewRes.ok) {
      throw new Error(`Failed to load epic overview. HTTP ${overviewRes.status}.`);
    }

    const overviewBody = (await overviewRes.json()) as EpicOverviewListEnvelope;
    const rows = overviewBody.data ?? [];

    const agents = agentsRes.ok
      ? (((await agentsRes.json()) as AgentListEnvelope).data ?? [])
        .map((item) => {
          const label = resolveAgentLabel(item);
          return label && item.id ? { id: item.id, label } : null;
        })
        .filter((item): item is EpicOverviewAgent => item !== null)
        .sort((a, b) => a.label.localeCompare(b.label))
      : [];

    const labels = labelsRes.ok
      ? (((await labelsRes.json()) as LabelListEnvelope).data ?? [])
        .map((item) => {
          const name = item.name?.trim();
          return name ? { name } : null;
        })
        .filter((item): item is EpicOverviewLabel => item !== null)
      : [];

    return { rows, agents, labels };
  }, [filters.blocked, filters.label, filters.ownerId, filters.search, filters.sort, filters.status]);

  const agentLabelById = useMemo(() => {
    if (state.kind !== "ok") return new Map<string, string>();
    return new Map<string, string>(state.agents.map((agent) => [agent.id, agent.label]));
  }, [state]);

  const fetchStoriesPreview = useCallback(async (epicKey: string): Promise<EpicOverviewStoryPreview[]> => {
    const params = new URLSearchParams();
    params.set("epic_key", epicKey);
    params.set("sort", "-updated_at");
    params.set("limit", "100");

    const response = await fetch(apiUrl(`/v1/planning/stories?${params.toString()}`));
    if (!response.ok) {
      throw new Error(`Failed to load stories preview. HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as StoryListEnvelope;
    const rows = payload.data ?? [];

    return rows.flatMap((row) => {
      const id = row.id;
      const title = row.title;
      const status = parseItemStatus(row.status);
      if (!id || !title || !status) return [];
      const assigneeId = row.current_assignee_agent_id ?? null;
      return [{
        story_id: id,
        story_key: row.key ?? null,
        title,
        status,
        current_assignee_agent_id: assigneeId,
        assignee_label: assigneeId ? (agentLabelById.get(assigneeId) ?? null) : null,
        is_blocked: row.is_blocked ?? false,
        updated_at: row.updated_at ?? null,
      } satisfies EpicOverviewStoryPreview];
    });
  }, [agentLabelById]);

  const ensurePreviewLoaded = useCallback(async (epicKey: string) => {
    let shouldFetch = false;
    setPreviewByEpicKey((current) => {
      const existing = current[epicKey];
      if (existing && (existing.kind === "loading" || existing.kind === "ready")) {
        return current;
      }
      shouldFetch = true;
      return {
        ...current,
        [epicKey]: { kind: "loading" },
      };
    });

    if (!shouldFetch) return;

    try {
      const stories = await fetchStoriesPreview(epicKey);
      setPreviewByEpicKey((current) => ({
        ...current,
        [epicKey]: {
          kind: "ready",
          stories,
        },
      }));
    } catch (error) {
      setPreviewByEpicKey((current) => ({
        ...current,
        [epicKey]: {
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load story preview.",
        },
      }));
    }
  }, [fetchStoriesPreview]);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) throw new Error("Select a single project before refreshing.");
    const result = await fetchOverview(singleProjectId);
    setState({ kind: "ok", ...result });
  }, [fetchOverview, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) {
      return;
    }

    let cancelled = false;

    void fetchOverview(singleProjectId)
      .then((result) => {
        if (cancelled) return;
        setState({ kind: "ok", ...result });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load epic overview.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview, singleProjectId]);

  const rows = useMemo(
    () => (state.kind === "ok"
      ? applyClientEpicOverviewFilters(state.rows, filters, preset)
      : []),
    [filters, preset, state],
  );

  const stats = useMemo(() => buildEpicOverviewStats(rows), [rows]);

  const selectedEpic = useMemo(() => {
    if (rows.length === 0) return null;
    if (!selectedEpicKey) return rows[0] ?? null;
    return rows.find((item) => item.epic_key === selectedEpicKey) ?? rows[0] ?? null;
  }, [rows, selectedEpicKey]);

  const statusOptions = [
    { value: "", label: "Status: All" },
    { value: "TODO", label: "TODO" },
    { value: "IN_PROGRESS", label: "IN PROGRESS" },
    { value: "DONE", label: "DONE" },
  ];

  const ownerOptions = [
    { value: "", label: "Owner: All" },
    ...(state.kind === "ok"
      ? state.agents.map((agent) => ({ value: agent.id, label: agent.label }))
      : []),
  ];

  const labelOptions = [
    { value: "", label: "Label: All" },
    ...(state.kind === "ok"
      ? state.labels.map((label) => ({ value: label.name, label: label.name }))
      : []),
  ];

  const blockedOptions = [
    { value: "", label: "Blocked: All" },
    { value: "true", label: "Blocked only" },
    { value: "false", label: "Unblocked only" },
  ];

  const previewStatusOptions = [
    { value: "", label: "Story status: All" },
    { value: "TODO", label: "TODO" },
    { value: "IN_PROGRESS", label: "IN PROGRESS" },
    { value: "CODE_REVIEW", label: "CODE REVIEW" },
    { value: "VERIFY", label: "VERIFY" },
    { value: "DONE", label: "DONE" },
  ];

  const previewBlockedOptions = [
    { value: "", label: "Blocked: All" },
    { value: "true", label: "Blocked only" },
    { value: "false", label: "Unblocked only" },
  ];

  const topContext = state.kind === "ok"
    ? `${rows.length} of ${state.rows.length} epics visible`
    : undefined;

  const pageState = !singleProjectId
    ? { kind: "no-project" as const }
    : state.kind === "no-project"
      ? { kind: "loading" as const }
      : state;

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedEpicKey(null);
      return;
    }

    setSelectedEpicKey((current) => (
      current && rows.some((item) => item.epic_key === current)
        ? current
        : rows[0].epic_key
    ));
  }, [rows]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isShortcutInputTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        const nextKey = getAdjacentEpicKey(rows.map((item) => item.epic_key), selectedEpicKey, 1);
        if (!nextKey) return;
        setSelectedEpicKey(nextKey);
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        const nextKey = getAdjacentEpicKey(rows.map((item) => item.epic_key), selectedEpicKey, -1);
        if (!nextKey) return;
        setSelectedEpicKey(nextKey);
        return;
      }

      if (event.key.toLowerCase() === "o") {
        if (!selectedEpicKey) return;
        event.preventDefault();
        setExpandedByEpicKey((current) => ({
          ...current,
          [selectedEpicKey]: true,
        }));
        void ensurePreviewLoaded(selectedEpicKey);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ensurePreviewLoaded, rows, selectedEpicKey]);

  const setPreviewFilter = useCallback(
    (epicKey: string, patch: Partial<EpicOverviewStoryPreviewFilters>) => {
      setPreviewFiltersByEpicKey((current) => ({
        ...current,
        [epicKey]: {
          ...(current[epicKey] ?? EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS),
          ...patch,
        },
      }));
    },
    [],
  );

  useEffect(() => {
    if (!selectedEpic) return;
    void ensurePreviewLoaded(selectedEpic.epic_key);
  }, [ensurePreviewLoaded, selectedEpic]);

  const selectedPreviewState = selectedEpic
    ? (previewByEpicKey[selectedEpic.epic_key] ?? { kind: "idle" as const })
    : ({ kind: "idle" as const });
  const selectedPreviewFilters = selectedEpic
    ? (previewFiltersByEpicKey[selectedEpic.epic_key] ?? EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS)
    : EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS;
  const selectedStories = selectedPreviewState.kind === "ready"
    ? applyStoryPreviewFilters(selectedPreviewState.stories, selectedPreviewFilters)
    : [];
  const selectedActionError = selectedEpic ? storyErrorByEpicKey[selectedEpic.epic_key] : undefined;

  const clearStoryError = useCallback((epicKey: string) => {
    setStoryErrorByEpicKey((current) => {
      if (!current[epicKey]) return current;
      const next = { ...current };
      delete next[epicKey];
      return next;
    });
  }, []);

  const setStoryError = useCallback((epicKey: string, message: string) => {
    setStoryErrorByEpicKey((current) => ({
      ...current,
      [epicKey]: message,
    }));
  }, []);

  const markStoryPending = useCallback((storyId: string, pending: boolean) => {
    setStoryPendingById((current) => {
      if (pending) {
        return { ...current, [storyId]: true };
      }
      if (!current[storyId]) return current;
      const next = { ...current };
      delete next[storyId];
      return next;
    });
  }, []);

  const updateCachedStory = useCallback((
    epicKey: string,
    storyId: string,
    patch: Partial<EpicOverviewStoryPreview>,
  ) => {
    setPreviewByEpicKey((current) => {
      const entry = current[epicKey];
      if (!entry || entry.kind !== "ready") return current;
      const nextStories = entry.stories.map((story) => (
        story.story_id === storyId
          ? { ...story, ...patch }
          : story
      ));
      return {
        ...current,
        [epicKey]: {
          kind: "ready",
          stories: nextStories,
        },
      };
    });
  }, []);

  const changeStoryStatus = useCallback(async (
    epicKey: string,
    story: EpicOverviewStoryPreview,
    nextStatus: ItemStatus,
  ) => {
    if (storyPendingById[story.story_id]) return;

    markStoryPending(story.story_id, true);
    clearStoryError(epicKey);

    try {
      const response = await fetch(apiUrl("/v1/planning/epics/bulk/story-status"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_ids: [story.story_id],
          status: nextStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(await toActionHttpErrorMessage(response, "status"));
      }

      const payload = (await response.json()) as BulkOperationEnvelope;
      const result = payload.data?.results?.find((item) => item.entity_id === story.story_id);
      if (!result || !result.success) {
        throw new Error(toBulkResultErrorMessage(result ?? {}, "status"));
      }

      updateCachedStory(epicKey, story.story_id, {
        status: nextStatus,
        updated_at: result.timestamp ?? story.updated_at,
      });
    } catch (error) {
      setStoryError(
        epicKey,
        error instanceof Error ? error.message : "Failed to update story status.",
      );
    } finally {
      markStoryPending(story.story_id, false);
    }
  }, [clearStoryError, markStoryPending, setStoryError, storyPendingById, updateCachedStory]);

  const addStoryToSprint = useCallback(async (epicKey: string, story: EpicOverviewStoryPreview) => {
    if (!singleProjectId) {
      setStoryError(epicKey, "Select a single project before adding a story to sprint.");
      return;
    }
    if (storyPendingById[story.story_id]) return;

    markStoryPending(story.story_id, true);
    clearStoryError(epicKey);

    try {
      const response = await fetch(
        apiUrl(`/v1/planning/epics/bulk/active-sprint/add?project_id=${singleProjectId}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story_ids: [story.story_id] }),
        },
      );

      if (!response.ok) {
        throw new Error(await toActionHttpErrorMessage(response, "add-to-sprint"));
      }

      const payload = (await response.json()) as BulkOperationEnvelope;
      const result = payload.data?.results?.find((item) => item.entity_id === story.story_id);
      if (!result || !result.success) {
        throw new Error(toBulkResultErrorMessage(result ?? {}, "add-to-sprint"));
      }

      updateCachedStory(epicKey, story.story_id, {
        updated_at: result.timestamp ?? story.updated_at,
      });
    } catch (error) {
      setStoryError(
        epicKey,
        error instanceof Error ? error.message : "Failed to add story to sprint.",
      );
    } finally {
      markStoryPending(story.story_id, false);
    }
  }, [clearStoryError, markStoryPending, setStoryError, singleProjectId, storyPendingById, updateCachedStory]);

  return (
    <>
      <PlanningTopShell
        icon={Radar}
        title="Epics Overview"
        subtitle="Health, progress, and risk overview for all epics in selected project."
        context={topContext}
        controls={singleProjectId ? (
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={filters.search}
                onChange={(event) => updateParam(FILTER_KEYS.search, event.target.value)}
                placeholder="Search by epic key or title"
                className={cn(
                  "h-8 min-w-[220px] flex-1 rounded-md border border-border/60 bg-background px-3 text-sm",
                  "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              />

              <ThemedSelect
                value={filters.status}
                options={statusOptions}
                placeholder="Status"
                onValueChange={(next) => updateParam(FILTER_KEYS.status, next)}
                triggerClassName="h-8 min-w-[130px] bg-background/70 text-xs"
                contentClassName="w-[180px]"
              />

              <ThemedSelect
                value={filters.ownerId}
                options={ownerOptions}
                placeholder="Owner"
                onValueChange={(next) => updateParam(FILTER_KEYS.ownerId, next)}
                triggerClassName="h-8 min-w-[150px] bg-background/70 text-xs"
                contentClassName="w-[220px]"
              />

              <ThemedSelect
                value={filters.label}
                options={labelOptions}
                placeholder="Label"
                onValueChange={(next) => updateParam(FILTER_KEYS.label, next)}
                triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs"
                contentClassName="w-[200px]"
              />

              <ThemedSelect
                value={filters.blocked}
                options={blockedOptions}
                placeholder="Blocked"
                onValueChange={(next) => updateParam(FILTER_KEYS.blocked, next)}
                triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs"
                contentClassName="w-[200px]"
              />

              <ThemedSelect
                value={filters.sort}
                options={EPIC_OVERVIEW_SORT_OPTIONS}
                placeholder="Sort"
                onValueChange={(next) => updateParam(FILTER_KEYS.sort, next)}
                triggerClassName="h-8 min-w-[165px] bg-background/70 text-xs"
                contentClassName="w-[210px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {EPIC_OVERVIEW_PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyPreset(item.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    preset === item.key
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-border",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        actions={(
          <PlanningRefreshControl
            onRefresh={refreshCurrentView}
            disabled={!singleProjectId}
            className="items-stretch sm:items-end"
          />
        )}
      />

      {pageState.kind === "no-project" && (
        <EmptyState
          icon="default"
          title="Select a project"
          description="Choose a single project from the selector above to view epic health overview."
        />
      )}

      {pageState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {pageState.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load epic overview"
          description={pageState.message}
        />
      )}

      {pageState.kind === "ok" && (
        <>
          <section className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Radar className="size-3.5" />
                Epics
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.epicCount}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Avg progress (all)
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{toPercentLabel(stats.averageProgressPct)}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Avg trend (7d)
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">+{toPercentLabel(stats.averageTrend7dPct)}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" />
                Blocked stories
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.blockedStories}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TimerReset className="size-3.5" />
                Last update age
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.maxStaleDays}d</p>
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              icon="default"
              title="No matching epics"
              description="No epic matches active filters/preset. Adjust filters to broaden scope."
            />
          ) : (
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
              <div className="overflow-hidden rounded-lg border border-border/60 bg-card/20">
                <div className="grid grid-cols-[40px_120px_minmax(0,1fr)_90px_160px_130px_90px] gap-2 border-b border-border/30 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span aria-hidden="true" />
                <span>Epic</span>
                <span>Title</span>
                <span>Status</span>
                <span>Progress</span>
                <span>Stories</span>
                <span>Risk</span>
              </div>

              <div className="divide-y divide-border/20">
                {rows.map((item) => {
                  const isExpanded = expandedByEpicKey[item.epic_key] ?? false;
                  const previewState = previewByEpicKey[item.epic_key] ?? { kind: "idle" as const };
                  const previewFilters = previewFiltersByEpicKey[item.epic_key] ?? EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS;
                  const stories = previewState.kind === "ready"
                    ? applyStoryPreviewFilters(previewState.stories, previewFilters)
                    : [];
                  const actionError = storyErrorByEpicKey[item.epic_key];

                  return (
                    <article key={item.epic_key} className={cn("px-3 py-2.5", selectedEpic?.epic_key === item.epic_key ? "bg-primary/5" : "")}>
                      <div
                        className="grid grid-cols-[40px_120px_minmax(0,1fr)_90px_160px_130px_90px] gap-2"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEpicKey(item.epic_key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedEpicKey(item.epic_key);
                          }
                        }}
                      >
                        <button
                          type="button"
                          aria-label={isExpanded ? `Collapse ${item.epic_key}` : `Expand ${item.epic_key}`}
                          onClick={() => {
                            const nextExpanded = !isExpanded;
                            setExpandedByEpicKey((current) => ({
                              ...current,
                              [item.epic_key]: nextExpanded,
                            }));
                            if (nextExpanded) {
                              void ensurePreviewLoaded(item.epic_key);
                            }
                          }}
                          className="inline-flex size-7 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                        >
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>

                        <p className="pt-1 font-mono text-xs text-muted-foreground">{item.epic_key}</p>
                        <p className="truncate pt-1 text-sm text-foreground" title={item.title}>{item.title}</p>

                        <Badge variant={statusVariant(item.status)} className="h-fit w-fit text-[11px]">
                          {item.status.replaceAll("_", " ")}
                        </Badge>

                        <div className="space-y-1">
                          <ProgressBar value={item.progress_pct} />
                          <p className="text-[11px] text-muted-foreground">{toPercentLabel(item.progress_pct)}</p>
                        </div>

                        <p className="text-[11px] text-muted-foreground">{toStoriesLabel(item)}</p>

                        <div className="flex items-center gap-1 text-[11px]">
                          {item.blocked_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-300">
                              <AlertTriangle className="size-3" />
                              {item.blocked_count}
                            </span>
                          ) : (
                            <span className="text-emerald-300">ok</span>
                          )}
                          {item.stale_days >= 7 ? (
                            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                              {item.stale_days}d
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="ml-10 mt-3 rounded-md border border-border/40 bg-background/30 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <ThemedSelect
                              value={previewFilters.status}
                              options={previewStatusOptions}
                              placeholder="Story status"
                              onValueChange={(value) => setPreviewFilter(item.epic_key, { status: value as ItemStatus | "" })}
                              triggerClassName="h-8 min-w-[170px] bg-background/80 text-xs"
                              contentClassName="w-[220px]"
                            />
                            <ThemedSelect
                              value={previewFilters.blocked}
                              options={previewBlockedOptions}
                              placeholder="Blocked"
                              onValueChange={(value) => setPreviewFilter(item.epic_key, { blocked: value as "" | "true" | "false" })}
                              triggerClassName="h-8 min-w-[160px] bg-background/80 text-xs"
                              contentClassName="w-[210px]"
                            />
                          </div>

                          {actionError ? (
                            <p className="mb-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
                              {actionError}
                            </p>
                          ) : null}

                          {previewState.kind === "loading" || previewState.kind === "idle" ? (
                            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" />
                              Loading story preview...
                            </div>
                          ) : null}

                          {previewState.kind === "error" ? (
                            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-2 text-xs text-red-200">
                              {previewState.message}
                            </div>
                          ) : null}

                          {previewState.kind === "ready" ? (
                            stories.length === 0 ? (
                              <div className="rounded border border-border/40 bg-background/40 px-2 py-3 text-xs text-muted-foreground">
                                No stories match preview filters.
                              </div>
                            ) : (
                              <div className="overflow-hidden rounded border border-border/40">
                                <div className="grid grid-cols-[120px_minmax(0,1fr)_130px_140px_110px_150px_260px] gap-2 border-b border-border/30 bg-background/50 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <span>Story</span>
                                  <span>Title</span>
                                  <span>Status</span>
                                  <span>Assignee</span>
                                  <span>Blocked</span>
                                  <span>Updated</span>
                                  <span>Quick actions</span>
                                </div>
                                <div className="divide-y divide-border/20">
                                  {stories.map((story) => {
                                    const pending = Boolean(storyPendingById[story.story_id]);

                                    return (
                                      <div
                                        key={story.story_id}
                                        className="grid grid-cols-[120px_minmax(0,1fr)_130px_140px_110px_150px_260px] gap-2 px-2 py-2"
                                      >
                                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                                          {story.story_key ?? "—"}
                                        </span>

                                        <span className="truncate text-xs text-foreground" title={toStoryPreviewTitle(story)}>
                                          {story.title}
                                        </span>

                                        <Badge variant={storyStatusVariant(story.status)} className="h-fit w-fit text-[10px]">
                                          {story.status.replaceAll("_", " ")}
                                        </Badge>

                                        <span className="truncate text-xs text-muted-foreground">
                                          {toStoryPreviewAssignee(story)}
                                        </span>

                                        <StoryBlockedBadge blocked={story.is_blocked} />

                                        <span className="text-xs text-muted-foreground">
                                          {toStoryPreviewUpdatedAt(story)}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                          <Link
                                            href={`/planning/stories/${story.story_id}`}
                                            className="inline-flex h-7 items-center gap-1 rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border"
                                          >
                                            Details
                                            <ExternalLink className="size-3" />
                                          </Link>

                                          <ThemedSelect
                                            value={story.status}
                                            options={previewStatusOptions.slice(1)}
                                            placeholder="Status"
                                            disabled={pending}
                                            onValueChange={(value) => {
                                              const status = parseItemStatus(value);
                                              if (!status || status === story.status) return;
                                              void changeStoryStatus(item.epic_key, story, status);
                                            }}
                                            triggerClassName="h-7 min-w-[118px] bg-background/80 text-[10px]"
                                            contentClassName="w-[170px]"
                                          />

                                          <button
                                            type="button"
                                            disabled={pending}
                                            onClick={() => {
                                              void addStoryToSprint(item.epic_key, story);
                                            }}
                                            className="inline-flex h-7 items-center rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            Add to sprint
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-lg border border-border/60 bg-card/20 p-3">
              <div className="mb-3 rounded border border-border/50 bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                Shortcuts: <span className="font-mono">/</span> focus filter, <span className="font-mono">j/k</span> next/prev epic, <span className="font-mono">o</span> open preview
              </div>

              {selectedEpic ? (
                <div className="space-y-3">
                  <div className="rounded border border-border/50 bg-background/40 px-2.5 py-2">
                    <p className="font-mono text-[11px] text-muted-foreground">{selectedEpic.epic_key}</p>
                    <p className="mt-1 text-sm text-foreground">{selectedEpic.title}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <span>{toPercentLabel(selectedEpic.progress_pct)} progress</span>
                      <span>+{toPercentLabel(selectedEpic.progress_trend_7d)} / 7d</span>
                      <span>{selectedEpic.stale_days}d stale</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedByEpicKey((current) => ({
                          ...current,
                          [selectedEpic.epic_key]: true,
                        }));
                        void ensurePreviewLoaded(selectedEpic.epic_key);
                      }}
                      className="inline-flex h-8 items-center rounded border border-border/60 px-2 text-xs text-foreground transition-colors hover:border-border"
                    >
                      Open preview (o)
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ThemedSelect
                      value={selectedPreviewFilters.status}
                      options={previewStatusOptions}
                      placeholder="Story status"
                      onValueChange={(value) => setPreviewFilter(selectedEpic.epic_key, { status: value as ItemStatus | "" })}
                      triggerClassName="h-8 min-w-[170px] bg-background/80 text-xs"
                      contentClassName="w-[220px]"
                    />
                    <ThemedSelect
                      value={selectedPreviewFilters.blocked}
                      options={previewBlockedOptions}
                      placeholder="Blocked"
                      onValueChange={(value) => setPreviewFilter(selectedEpic.epic_key, { blocked: value as "" | "true" | "false" })}
                      triggerClassName="h-8 min-w-[160px] bg-background/80 text-xs"
                      contentClassName="w-[210px]"
                    />
                  </div>

                  {selectedActionError ? (
                    <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
                      {selectedActionError}
                    </p>
                  ) : null}

                  {selectedPreviewState.kind === "loading" || selectedPreviewState.kind === "idle" ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading story preview...
                    </div>
                  ) : null}

                  {selectedPreviewState.kind === "error" ? (
                    <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-2 text-xs text-red-200">
                      {selectedPreviewState.message}
                    </div>
                  ) : null}

                  {selectedPreviewState.kind === "ready" ? (
                    selectedStories.length === 0 ? (
                      <div className="rounded border border-border/40 bg-background/40 px-2 py-3 text-xs text-muted-foreground">
                        No stories match preview filters.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedStories.map((story) => {
                          const pending = Boolean(storyPendingById[story.story_id]);

                          return (
                            <div key={story.story_id} className="rounded border border-border/40 bg-background/35 p-2">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="truncate font-mono text-[11px] text-muted-foreground">{story.story_key ?? "—"}</span>
                                <Badge variant={storyStatusVariant(story.status)} className="h-fit w-fit text-[10px]">
                                  {story.status.replaceAll("_", " ")}
                                </Badge>
                              </div>
                              <p className="truncate text-xs text-foreground" title={toStoryPreviewTitle(story)}>{story.title}</p>
                              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                <span>{toStoryPreviewAssignee(story)}</span>
                                <StoryBlockedBadge blocked={story.is_blocked} />
                                <span>{toStoryPreviewUpdatedAt(story)}</span>
                              </div>
                              <div className="mt-2 flex items-center gap-1.5">
                                <Link
                                  href={`/planning/stories/${story.story_id}`}
                                  className="inline-flex h-7 items-center gap-1 rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border"
                                >
                                  Details
                                  <ExternalLink className="size-3" />
                                </Link>

                                <ThemedSelect
                                  value={story.status}
                                  options={previewStatusOptions.slice(1)}
                                  placeholder="Status"
                                  disabled={pending}
                                  onValueChange={(value) => {
                                    const status = parseItemStatus(value);
                                    if (!status || status === story.status) return;
                                    void changeStoryStatus(selectedEpic.epic_key, story, status);
                                  }}
                                  triggerClassName="h-7 min-w-[118px] bg-background/80 text-[10px]"
                                  contentClassName="w-[170px]"
                                />

                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => {
                                    void addStoryToSprint(selectedEpic.epic_key, story);
                                  }}
                                  className="inline-flex h-7 items-center rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Add to sprint
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                </div>
              ) : (
                <div className="rounded border border-border/40 bg-background/35 px-3 py-6 text-sm text-muted-foreground">
                  Select an epic to open split-view details.
                </div>
              )}
            </aside>
          </section>
          )}
        </>
      )}
    </>
  );
}

export default function PlanningEpicsOverviewPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <EpicOverviewPageContent />
    </Suspense>
  );
}
