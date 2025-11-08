/**
 * Stats tool response types
 */

import type { LayerSummary, ActivityLogEntry } from '../view-entities.js';

export interface GetLayerSummaryResponse {
  summary: LayerSummary[];
}

export interface ClearOldDataResponse {
  success: boolean;
  messages_deleted: number;
  file_changes_deleted: number;
  activity_logs_deleted: number;
  agents_released: number;
}

export interface GetStatsResponse {
  agents: number;
  files: number;
  context_keys: number;
  active_decisions: number;
  total_decisions: number;
  file_changes: number;
  active_constraints: number;
  total_constraints: number;
  tags: number;
  scopes: number;
  layers: number;
  // Task statistics (v3.x)
  total_tasks: number;
  active_tasks: number;  // Excludes archived and done
  tasks_by_status: {
    todo: number;
    in_progress: number;
    waiting_review: number;
    blocked: number;
    done: number;
    archived: number;
  };
  tasks_by_priority: {
    low: number;      // priority = 1
    medium: number;   // priority = 2
    high: number;     // priority = 3
    critical: number; // priority = 4
  };
  // Review status (v3.4.0)
  review_status: {
    awaiting_commit: number;  // Tasks in waiting_review awaiting git commits
    overdue_review: number;   // Tasks in waiting_review > 24h
  };
}

export interface FlushWALResponse {
  success: boolean;
  mode: string;  // 'TRUNCATE'
  pages_flushed: number;
  message: string;
}

export interface GetActivityLogResponse {
  activities: ActivityLogEntry[];
  count: number;
}

// Re-export view entities used in responses
export type { LayerSummary, ActivityLogEntry };
