"use client";

import { useState, useCallback } from "react";
import { apiUrl } from "@/lib/api-client";
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "./format-helpers";
import type { ImportStatusInfo } from "@/lib/dashboard-types";

type ImportButtonState = "idle" | "loading" | "success" | "error";

export function ImportButton({
  onImportComplete,
}: {
  onImportComplete: () => void;
}) {
  const [state, setState] = useState<ImportButtonState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);

    try {
      const res = await fetch(apiUrl("/v1/observability/imports"), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState("success");
      onImportComplete();
      // Reset to idle after a brief flash
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
      setTimeout(() => setState("idle"), 5000);
    }
  }, [onImportComplete]);

  return (
    <div className="flex items-center gap-3">
      {state === "error" && errorMsg && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {errorMsg}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={state === "loading"}
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {state === "loading"
          ? "Importing…"
          : state === "success"
            ? "Imported"
            : "Import from Langfuse"}
      </Button>
    </div>
  );
}

export function ImportStatusBar({ status }: { status: ImportStatusInfo }) {
  const { lastImport, counts } = status;
  if (!lastImport) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        Last import: {formatDate(lastImport.started_at)}
      </span>
      <Badge
        variant={lastImport.status === "success" ? "secondary" : "destructive"}
        className="text-[10px] uppercase tracking-wider"
      >
        {lastImport.status}
      </Badge>
      <span className="inline-flex items-center gap-1.5">
        <Database className="h-3 w-3" />
        {counts.metrics} metrics · {counts.requests} requests
      </span>
      {(lastImport.from_timestamp || lastImport.to_timestamp) && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3 w-3" />
          {lastImport.from_timestamp
            ? formatDate(lastImport.from_timestamp)
            : "start"}
          {" → "}
          {formatDate(lastImport.to_timestamp)}
        </span>
      )}
    </div>
  );
}
