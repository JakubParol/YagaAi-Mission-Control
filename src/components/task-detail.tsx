"use client";

import Link from "next/link";
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
      <nav className="mb-6 text-sm text-[#94a3b8]">
        <Link href="/" className="hover:text-[#e2e8f0] transition-colors duration-200">
          Stories
        </Link>
        <span className="mx-2 text-[#1f2937]">/</span>
        <Link
          href={`/stories/${task.story_id}`}
          className="hover:text-[#e2e8f0] transition-colors duration-200 font-mono"
        >
          {task.story_id}
        </Link>
        <span className="mx-2 text-[#1f2937]">/</span>
        <span className="text-[#e2e8f0] font-mono">{task.task_id}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono text-[#e2e8f0] mb-3">{task.task_id}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <StateBadge state={task.state} />
          <span className="inline-flex items-center rounded-full border border-[#1f2937] bg-[#0f172a] px-2.5 py-0.5 text-xs font-medium text-[#94a3b8]">
            {task.worker_type}
          </span>
          <span className="text-sm text-[#94a3b8]">
            Story:{" "}
            <Link
              href={`/stories/${task.story_id}`}
              className="hover:text-[#e2e8f0] transition-colors duration-200 font-mono"
            >
              {task.story_id}
            </Link>
          </span>
        </div>
      </div>

      {/* Objective */}
      <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] mb-6">
        <div className="px-6 py-4 border-b border-[#1f2937]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
            Objective
          </h2>
        </div>
        <div className="px-6 py-4">
          <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-[#e2e8f0]">
            {task.objective}
          </pre>
        </div>
      </div>

      {/* Inputs */}
      {task.inputs && task.inputs.length > 0 && (
        <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] mb-6">
          <div className="px-6 py-4 border-b border-[#1f2937]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Inputs
            </h2>
          </div>
          <div className="px-6 py-4">
            <dl className="space-y-2">
              {task.inputs.map((input) => (
                <div key={input.name} className="flex gap-2">
                  <dt className="font-mono text-sm font-medium min-w-[160px] text-[#e2e8f0]">
                    {input.name}:
                  </dt>
                  <dd className="text-sm text-[#94a3b8]">
                    {String(input.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Constraints */}
      {task.constraints?.tools_allowed && (
        <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] mb-6">
          <div className="px-6 py-4 border-b border-[#1f2937]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Constraints
            </h2>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-[#94a3b8]">Tools allowed:</span>
              {task.constraints.tools_allowed.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center rounded-full border border-[#1f2937] bg-[#0f172a] px-2.5 py-0.5 text-xs font-mono font-medium text-[#94a3b8]"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Output Requirements */}
      {task.output_requirements && (
        <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] mb-6">
          <div className="px-6 py-4 border-b border-[#1f2937]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Output Requirements
            </h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            {task.output_requirements.format && (
              <div>
                <span className="text-sm text-[#94a3b8]">Format: </span>
                <span className="inline-flex items-center rounded-full border border-[#1f2937] bg-[#0f172a] px-2.5 py-0.5 text-xs font-mono font-medium text-[#94a3b8]">
                  {task.output_requirements.format}
                </span>
              </div>
            )}
            {task.output_requirements.success_criteria && (
              <div>
                <p className="text-sm text-[#94a3b8] mb-1">Success Criteria:</p>
                <pre className="whitespace-pre-wrap text-sm font-mono bg-[#020617] rounded-lg p-3 text-[#e2e8f0] border border-[#1f2937]">
                  {task.output_requirements.success_criteria}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.files.length > 0 && (
        <>
          <div className="border-t border-[#1f2937] my-8" />
          <h2 className="text-xl font-semibold text-[#e2e8f0] mb-4">
            Results ({results.files.length} files)
          </h2>
          <div className="space-y-4">
            {results.files.map((file) => (
              <div key={file.path} className="rounded-xl border border-[#1f2937] bg-[#0b1220]">
                <div className="px-6 py-3 border-b border-[#1f2937]">
                  <p className="font-mono text-sm font-semibold text-[#e2e8f0]">
                    {file.path}
                  </p>
                </div>
                {file.content !== null && (
                  <div className="px-6 py-4">
                    <pre className="whitespace-pre-wrap text-xs font-mono bg-[#020617] rounded-lg p-3 max-h-96 overflow-auto text-[#e2e8f0] border border-[#1f2937]">
                      {file.content}
                    </pre>
                  </div>
                )}
                {file.content === null && (
                  <div className="px-6 py-4">
                    <p className="text-xs text-[#94a3b8] italic">
                      Binary file — preview not available
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
