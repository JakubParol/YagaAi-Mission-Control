export type PlanningResourceName =
  | "project"
  | "agent"
  | "label"
  | "backlog"
  | "work-item"
  // Legacy aliases — delegate to work-item with type filter
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
  "work-item": "/v1/planning/work-items",
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
  "work-item": {
    name: "work-item",
    listPath: () => PATHS["work-item"],
    itemPath: (id) => `${PATHS["work-item"]}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  // Legacy aliases: point to work-items with type query param
  story: {
    name: "story",
    listPath: () => `${PATHS["work-item"]}?type=STORY`,
    itemPath: (id) => `${PATHS["work-item"]}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  task: {
    name: "task",
    listPath: () => `${PATHS["work-item"]}?type=TASK`,
    itemPath: (id) => `${PATHS["work-item"]}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
  epic: {
    name: "epic",
    listPath: () => `${PATHS["work-item"]}?type=EPIC`,
    itemPath: (id) => `${PATHS["work-item"]}/${id}`,
    requiredContext: [],
    defaultSort: "-created_at",
  },
};
