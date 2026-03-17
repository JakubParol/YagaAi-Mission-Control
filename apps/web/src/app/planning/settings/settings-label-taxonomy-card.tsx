"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { Notice, PlanningLabel, PlanningProject } from "./settings-label-actions";
import {
  getProjectByKey,
  listLabelsByProjectKey,
  noticeStyle,
  PROJECT_KEY,
} from "./settings-label-actions";
import { LabelCreateForm } from "./label-create-form";
import { LabelRow } from "./label-row";

export function SettingsLabelTaxonomyCard() {
  const [project, setProject] = useState<PlanningProject | null>(null);
  const [labels, setLabels] = useState<PlanningLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasLabels = labels.length > 0;

  const sortedLabels = useMemo(() => {
    return [...labels].sort((left, right) => left.name.localeCompare(right.name));
  }, [labels]);

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const selectedProject = await getProjectByKey(PROJECT_KEY);
      const projectLabels = await listLabelsByProjectKey(selectedProject.key);
      setProject(selectedProject);
      setLabels(projectLabels);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load label taxonomy.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLabels = useCallback(async (): Promise<void> => {
    if (!project) return;
    const projectLabels = await listLabelsByProjectKey(project.key);
    setLabels(projectLabels);
  }, [project]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  function handleNotice(next: Notice): void {
    if (next.kind === "success" && next.message === "") {
      setNotice(null);
      return;
    }
    setNotice(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label taxonomy</CardTitle>
        <CardDescription>
          Real labels from API for project <code>{PROJECT_KEY}</code>, including create, rename, and
          delete.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {notice ? (
          <div className={`rounded border px-3 py-2 text-xs ${noticeStyle(notice.kind)}`}>
            {notice.message}
          </div>
        ) : null}

        <LabelCreateForm
          project={project}
          loading={loading}
          onCreated={refreshLabels}
          onNotice={handleNotice}
        />

        {loadError ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200">
            {loadError}
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => void loadInitial()}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {!loadError && loading ? (
          <p className="text-muted-foreground">Loading labels...</p>
        ) : null}

        {!loadError && !loading && !hasLabels ? (
          <p className="text-muted-foreground">No labels available for this project scope.</p>
        ) : null}

        {!loadError && !loading && hasLabels ? (
          <div className="space-y-2">
            {sortedLabels.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                onMutated={refreshLabels}
                onNotice={handleNotice}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between border-t">
        <Badge variant="outline">{labels.length} labels</Badge>
        <Badge variant="outline">Live API</Badge>
      </CardFooter>
    </Card>
  );
}
