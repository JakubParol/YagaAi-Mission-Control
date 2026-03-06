"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface PlanningFilterState {
  selectedProjectIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  toggleProject: (id: string) => void;
  allSelected: boolean;
  singleProjectId: string | null;
}

const PlanningFilterContext = createContext<PlanningFilterState | null>(null);

export function PlanningFilterProvider({ children }: { children: React.ReactNode }) {
  // Empty array = "all projects selected". Toggling off the last project
  // resets to [] which means "all" — this is intentional to avoid an empty view.
  const [selectedProjectIds, setSelectedProjectIdsState] = useState<string[]>([]);
  const setSelectedProjectIds = useCallback((ids: string[]) => {
    setSelectedProjectIdsState(ids);
  }, []);

  const toggleProject = useCallback((id: string) => {
    setSelectedProjectIdsState((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const singleProjectId = selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;

  const value = useMemo(
    () => ({
      selectedProjectIds,
      setSelectedProjectIds,
      toggleProject,
      allSelected: selectedProjectIds.length === 0,
      singleProjectId,
    }),
    [selectedProjectIds, setSelectedProjectIds, singleProjectId, toggleProject],
  );

  return (
    <PlanningFilterContext.Provider value={value}>{children}</PlanningFilterContext.Provider>
  );
}

export function usePlanningFilter(): PlanningFilterState {
  const ctx = useContext(PlanningFilterContext);
  if (!ctx) {
    throw new Error("usePlanningFilter must be used within PlanningFilterProvider");
  }
  return ctx;
}
