/**
 * Server-only adapter for reading agent status from the Workflow System filesystem.
 */
import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";

import { WORKFLOW_SYSTEM_PATH, STORIES_PATH } from "./config";
import type { AgentStatus } from "../dashboard-types";

interface AgentConfig {
  name: string;
  role: string;
  workerType: string | null;
}

const AGENTS: AgentConfig[] = [
  { name: "James", role: "Supervisor / CSO", workerType: null },
  { name: "Naomi", role: "Principal Developer", workerType: "coder" },
  { name: "Amos", role: "QA Engineer", workerType: "qa" },
  { name: "Alex", role: "Researcher", workerType: "research" },
];

/**
 * Parse the supervisor's last-tick.md to extract timestamp and decision.
 */
async function getSupervisorStatus(): Promise<{ decision: string | null }> {
  try {
    const tickPath = join(
      WORKFLOW_SYSTEM_PATH,
      "supervisor",
      "state",
      "last-tick.md",
    );
    const content = await readFile(tickPath, "utf-8");
    const decisionMatch = content.match(
      /\*\*Decision:\*\*\s*(.+?)(?:\n|$)/i,
    );
    return { decision: decisionMatch?.[1]?.trim() ?? null };
  } catch {
    return { decision: null };
  }
}

/**
 * Scan all ASSIGNED task YAML files for worker_type and objective fields.
 * Returns a map of workerType to task objective.
 */
async function getAssignedTasks(): Promise<Map<string, string>> {
  const assigned = new Map<string, string>();

  let storyDirs: string[];
  try {
    storyDirs = await readdir(STORIES_PATH);
  } catch {
    return assigned;
  }

  for (const storyId of storyDirs) {
    const assignedDir = join(STORIES_PATH, storyId, "TASKS", "ASSIGNED");
    let files: string[];
    try {
      files = await readdir(assignedDir);
    } catch {
      continue;
    }

    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );

    for (const file of yamlFiles) {
      try {
        const raw = await readFile(join(assignedDir, file), "utf-8");
        const data = yaml.load(raw) as Record<string, unknown>;
        if (data && typeof data === "object" && data.worker_type) {
          const wt = data.worker_type as string;
          const objective = (data.objective as string) || "";
          // First line of objective as task summary
          const summary = objective.split("\n").find((l) => l.trim())?.trim() || objective;
          assigned.set(wt, summary);
        }
      } catch {
        // Skip unparseable files
      }
    }
  }

  return assigned;
}

/**
 * Get the status of all agents.
 */
export async function getAgentStatuses(): Promise<AgentStatus[]> {
  const [supervisorStatus, assignedTasks] = await Promise.all([
    getSupervisorStatus(),
    getAssignedTasks(),
  ]);

  return AGENTS.map((agent) => {
    if (agent.workerType === null) {
      // James (supervisor) — working if decision involves active work
      const decision = supervisorStatus.decision?.toUpperCase() ?? "";
      const isWorking =
        decision.includes("ASSIGN") || decision.includes("CREATE");
      return {
        name: agent.name,
        role: agent.role,
        status: isWorking ? ("working" as const) : ("idle" as const),
        ...(isWorking && supervisorStatus.decision
          ? { task: supervisorStatus.decision }
          : {}),
      };
    }

    // Worker agents — working if they have an assigned task
    const task = assignedTasks.get(agent.workerType);
    return {
      name: agent.name,
      role: agent.role,
      status: task ? ("working" as const) : ("idle" as const),
      ...(task ? { task } : {}),
    };
  });
}
