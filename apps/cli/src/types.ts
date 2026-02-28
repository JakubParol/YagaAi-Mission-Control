// --- Projects ---

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  repo_root: string | null;
  created_at: string;
  updated_at: string;
}

// --- Epics ---

export interface Epic {
  id: string;
  project_id: string;
  key: string;
  title: string;
  description: string | null;
  status: string;
  status_mode: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

// --- Stories ---

export interface Story {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: string;
  status_mode: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

// --- Tasks ---

export interface Task {
  id: string;
  project_id: string | null;
  story_id: string | null;
  key: string | null;
  title: string;
  objective: string | null;
  task_type: string;
  status: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  estimate_points: number | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Labels ---

export interface Label {
  id: string;
  project_id: string | null;
  name: string;
  color: string | null;
}

// --- Agents ---

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
}
