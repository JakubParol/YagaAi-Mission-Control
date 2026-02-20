"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StateBadge } from "@/components/state-badge";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Task, TaskResult } from "@/lib/types";

interface TaskDetailData {
  task: Task;
  results: TaskResult | null;
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
    url: `/api/tasks/${storyId}/${taskId}`,
    initialData,
  });

  const { task, results } = data;

  return (
    <div>
      {/* Breadcrumbs */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Stories
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/stories/${task.story_id}`}
          className="hover:text-foreground transition-colors font-mono"
        >
          {task.story_id}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-mono">{task.task_id}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono mb-3">{task.task_id}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StateBadge state={task.state} />
          <Badge variant="outline">{task.worker_type}</Badge>
          <span className="text-sm text-muted-foreground">
            Story:{" "}
            <Link
              href={`/stories/${task.story_id}`}
              className="hover:text-foreground transition-colors font-mono"
            >
              {task.story_id}
            </Link>
          </span>
        </div>
      </div>

      {/* Objective */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
            Objective
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
            {task.objective}
          </pre>
        </CardContent>
      </Card>

      {/* Inputs */}
      {task.inputs && task.inputs.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Inputs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              {task.inputs.map((input) => (
                <div key={input.name} className="flex gap-2">
                  <dt className="font-mono text-sm font-medium min-w-[160px]">
                    {input.name}:
                  </dt>
                  <dd className="text-sm text-muted-foreground">
                    {String(input.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Constraints */}
      {task.constraints?.tools_allowed && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Constraints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                Tools allowed:
              </span>
              {task.constraints.tools_allowed.map((tool) => (
                <Badge key={tool} variant="secondary" className="font-mono">
                  {tool}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output Requirements */}
      {task.output_requirements && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Output Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {task.output_requirements.format && (
              <div>
                <span className="text-sm text-muted-foreground">Format: </span>
                <Badge variant="outline" className="font-mono">
                  {task.output_requirements.format}
                </Badge>
              </div>
            )}
            {task.output_requirements.success_criteria && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Success Criteria:
                </p>
                <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 rounded-md p-3">
                  {task.output_requirements.success_criteria}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && results.files.length > 0 && (
        <>
          <Separator className="my-8" />
          <h2 className="text-xl font-semibold mb-4">
            Results ({results.files.length} files)
          </h2>
          <div className="space-y-4">
            {results.files.map((file) => (
              <Card key={file.path}>
                <CardHeader className="py-3">
                  <CardTitle className="font-mono text-sm">
                    {file.path}
                  </CardTitle>
                </CardHeader>
                {file.content !== null && (
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/50 rounded-md p-3 max-h-96 overflow-auto">
                      {file.content}
                    </pre>
                  </CardContent>
                )}
                {file.content === null && (
                  <CardContent>
                    <p className="text-xs text-muted-foreground italic">
                      Binary file — preview not available
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
