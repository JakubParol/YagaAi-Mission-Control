"use client";

import { useState, useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { AgentsSection } from "./agents-section";
import { CostsSection } from "./costs-section";
import { RequestsSection } from "./requests-section";
import { ImportButton, ImportStatusBar } from "./import-controls";
import type {
  AgentStatus,
  CostMetrics,
  LLMRequestsResponse,
  ImportStatusInfo,
} from "@/lib/dashboard-types";

export interface DashboardProps {
  initialAgents: AgentStatus[];
  initialCosts: CostMetrics;
  initialRequests: LLMRequestsResponse;
  initialImportStatus: ImportStatusInfo;
  dbError?: string;
}

export function Dashboard({
  initialAgents,
  initialCosts,
  initialRequests,
  initialImportStatus,
  dbError,
}: DashboardProps) {
  const [importStatus, setImportStatus] =
    useState<ImportStatusInfo>(initialImportStatus);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleImportComplete = useCallback(async () => {
    // Re-fetch import status
    try {
      const res = await fetch("/api/dashboard/status");
      if (res.ok) {
        const data: ImportStatusInfo = await res.json();
        setImportStatus(data);
      }
    } catch {
      // Status fetch failed; data will refresh on next page load
    }
    // Bump key to force sections to re-fetch
    setRefreshKey((k) => k + 1);
  }, []);

  const isEmpty =
    importStatus.counts.metrics === 0 &&
    importStatus.counts.requests === 0 &&
    !importStatus.lastImport;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Agent status, LLM costs, and recent requests
          </p>
        </div>
        <ImportButton onImportComplete={handleImportComplete} />
      </div>

      {/* Database error alert */}
      {dbError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Database not found</p>
            <p className="mt-0.5 text-xs opacity-80">{dbError}</p>
          </div>
        </div>
      )}

      {/* Import status bar */}
      <ImportStatusBar status={importStatus} />

      {isEmpty ? (
        <EmptyState
          icon="board"
          title="No data yet"
          description="Import data from Langfuse to see agent costs, request metrics, and usage breakdowns."
        >
          <ImportButton onImportComplete={handleImportComplete} />
        </EmptyState>
      ) : (
        <>
          <AgentsSection key={`agents-${refreshKey}`} initialData={initialAgents} />
          <CostsSection key={`costs-${refreshKey}`} initialData={initialCosts} />
          <RequestsSection key={`requests-${refreshKey}`} initialData={initialRequests} />
        </>
      )}
    </div>
  );
}
