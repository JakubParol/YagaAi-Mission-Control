"use client";

import Link from "next/link";
import { StateBadge, ParseErrorBadge } from "@/components/state-badge";
import { apiUrl } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { WorkflowTask, TaskResult } from "@/lib/types";

interface TaskDetailData {
  task: WorkflowTask;
  results: TaskResult | null;
}

/** Reusable card section with a label header */
function DetailSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="rounded-lg border border-border bg-card mb-6">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function TaskDetail({
  storyId,
  taskId,
  initialData,
}: {
  storyId: string;
  taskId: string;
  initialData: TaskDetailData;
}) {
  const { data } = useAutoRefresh<TaskDetailData>({
    url: apiUrl(`/v1/workflow/tasks/${storyId}/${taskId}`),
    initialData,
  });

  const { task, results } = data;

  return (
    <div>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link
              href="/planning/stories"
              className="focus-ring rounded text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Stories
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40 select-none">/</li>
          <li>
            <Link
              href={`/planning/stories/${task.story_id}`}
              className="focus-ring rounded font-mono text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {task.story_id}
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40 select-none">/</li>
          <li aria-current="page" className="font-mono text-foreground">
            {task.task_id}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold font-mono text-foreground mb-3">
          {task.task_id}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StateBadge state={task.state} />
          {task.parseError && <ParseErrorBadge error={task.parseError} />}
          <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {task.worker_type}
          </span>
          <span className="text-sm text-muted-foreground">
            Story:{" "}
            <Link
              href={`/planning/stories/${task.story_id}`}
              className="focus-ring rounded font-mono transition-colors duration-150 hover:text-foreground"
            >
              {task.story_id}
            </Link>
          </span>
        </div>
      </div>

      {/* Parse Error */}
      {task.parseError && (
        <DetailSection label="Parse Error">
          <p className="text-sm text-red-400">{task.parseError}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            This task file could not be parsed. Fix the YAML source to resolve this error.
          </p>
        </DetailSection>
      )}

      {/* Objective */}
      <DetailSection label="Objective">
        <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground">
          {task.objective}
        </pre>
      </DetailSection>

      {/* Inputs */}
      {task.inputs && task.inputs.length > 0 && (
        <DetailSection label="Inputs">
          <dl className="space-y-2">
            {task.inputs.map((input) => (
              <div key={input.name} className="flex gap-2">
                <dt className="min-w-[160px] font-mono text-sm font-medium text-foreground">
                  {input.name}:
                </dt>
                <dd className="text-sm text-muted-foreground">
                  {String(input.value)}
                </dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      )}

      {/* Constraints */}
      {task.constraints?.tools_allowed && (
        <DetailSection label="Constraints">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Tools allowed:</span>
            {task.constraints.tools_allowed.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground"
              >
                {tool}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      {/* Output Requirements */}
      {task.output_requirements && (
        <DetailSection label="Output Requirements">
          <div className="space-y-3">
            {task.output_requirements.format && (
              <div>
                <span className="text-sm text-muted-foreground">Format: </span>
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                  {task.output_requirements.format}
                </span>
              </div>
            )}
            {task.output_requirements.success_criteria && (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Success Criteria:</p>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm font-mono text-foreground">
                  {task.output_requirements.success_criteria}
                </pre>
              </div>
            )}
          </div>
        </DetailSection>
      )}

      {/* Results */}
      {results && results.files.length > 0 && (
        <>
          <hr className="border-border my-8" />
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Results
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({results.files.length} {results.files.length === 1 ? "file" : "files"})
            </span>
          </h2>
          <div className="space-y-4">
            {results.files.map((file) => (
              <section key={file.path} aria-label={file.path} className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-5 py-3">
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {file.path}
                  </p>
                </div>
                {file.content !== null ? (
                  <div className="px-5 py-4">
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground">
                      {file.content}
                    </pre>
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-xs italic text-muted-foreground">
                      Binary file — preview not available
                    </p>
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
