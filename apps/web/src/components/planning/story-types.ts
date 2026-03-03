import type { ItemStatus } from "@/lib/planning/types";

export interface StoryDetail {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: ItemStatus;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  task_count: number;
}

export interface TaskItem {
  id: string;
  key: string | null;
  title: string;
  objective: string | null;
  task_type: string;
  status: ItemStatus;
  priority: number | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  estimate_points: number | null;
  due_at: string | null;
  current_assignee_agent_id: string | null;
}
