"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface PlanningFilterState {
  selectedProjectIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  toggleProject: (id: string) => void;
  selectedLabelIds: string[];
  setSelectedLabelIds: (ids: string[]) => void;
  toggleLabel: (id: string) => void;
  clearLabels: () => void;
  allSelected: boolean;
  singleProjectId: string | null;
}

const PlanningFilterContext = createContext<PlanningFilterState | null>(null);

export function PlanningFilterProvider({ children }: { children: React.ReactNode }) {
  // Empty array = "all projects selected". Toggling off the last project
  // resets to [] which means "all" — this is intentional to avoid an empty view.
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const toggleProject = useCallback((id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const toggleLabel = useCallback((id: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((labelId) => labelId !== id) : [...prev, id],
    );
  }, []);

  const clearLabels = useCallback(() => {
    setSelectedLabelIds([]);
  }, []);

  const singleProjectId = selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;
  const projectScopeKey = selectedProjectIds.slice().sort().join(",");

  useEffect(() => {
    setSelectedLabelIds([]);
  }, [projectScopeKey]);

  const value = useMemo(
    () => ({
      selectedProjectIds,
      setSelectedProjectIds,
      toggleProject,
      selectedLabelIds,
      setSelectedLabelIds,
      toggleLabel,
      clearLabels,
      allSelected: selectedProjectIds.length === 0,
      singleProjectId,
    }),
    [
      clearLabels,
      selectedLabelIds,
      selectedProjectIds,
      setSelectedLabelIds,
      singleProjectId,
      toggleLabel,
      toggleProject,
    ],
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
