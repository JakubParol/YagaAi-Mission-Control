"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface PlanningFilterState {
  selectedProjectIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  toggleProject: (id: string) => void;
  allSelected: boolean;
}

const PlanningFilterContext = createContext<PlanningFilterState | null>(null);

export function PlanningFilterProvider({ children }: { children: React.ReactNode }) {
  // Empty array = "all projects selected". Toggling off the last project
  // resets to [] which means "all" — this is intentional to avoid an empty view.
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const toggleProject = useCallback((id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const value = useMemo(
    () => ({
      selectedProjectIds,
      setSelectedProjectIds,
      toggleProject,
      allSelected: selectedProjectIds.length === 0,
    }),
    [selectedProjectIds, toggleProject],
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
