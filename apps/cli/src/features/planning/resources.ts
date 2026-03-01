export type PlanningResourceName =
  | "project"
  | "agent"
  | "label"
  | "backlog"
  | "story"
  | "task"
  | "epic";

export interface PathContext {
  projectId?: string;
}

export interface PlanningResourceSpec {
  name: PlanningResourceName;
  listPath: (ctx: PathContext) => string;
  itemPath: (id: string, ctx: PathContext) => string;
  requiredContext: Array<"projectId">;
  defaultSort?: string;
}

const PATHS = {
  project: "/v1/planning/projects",
  agent: "/v1/planning/agents",
  label: "/v1/planning/labels",
  backlog: "/v1/planning/backlogs",
  story: "/v1/planning/stories",
  task: "/v1/planning/tasks",
} as const;

export const PLANNING_RESOURCES: Record<PlanningResourceName, PlanningResourceSpec> = {
  project: {
    name: "project",
    listPath: () => PATHS.project,
    itemPath: (id) => `${PATHS.project}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  agent: {
    name: "agent",
    listPath: () => PATHS.agent,
    itemPath: (id) => `${PATHS.agent}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  label: {
    name: "label",
    listPath: () => PATHS.label,
    itemPath: (id) => `${PATHS.label}/${id}`,
    requiredContext: [],
  },
  backlog: {
    name: "backlog",
    listPath: () => PATHS.backlog,
    itemPath: (id) => `${PATHS.backlog}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  story: {
    name: "story",
    listPath: () => PATHS.story,
    itemPath: (id) => `${PATHS.story}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  task: {
    name: "task",
    listPath: () => PATHS.task,
    itemPath: (id) => `${PATHS.task}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  epic: {
    name: "epic",
    listPath: () => "/v1/planning/epics",
    itemPath: (id) => `/v1/planning/epics/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
};
