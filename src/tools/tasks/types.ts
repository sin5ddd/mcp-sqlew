/**
 * Task-specific types and constants
 */

/**
 * Task status enum (matches m_task_statuses)
 */
export const TASK_STATUS = {
  TODO: 1,
  IN_PROGRESS: 2,
  WAITING_REVIEW: 3,
  BLOCKED: 4,
  DONE: 5,
  ARCHIVED: 6,
  REJECTED: 7,
} as const;

/**
 * Task status name mapping
 */
export const STATUS_TO_ID: Record<string, number> = {
  'todo': TASK_STATUS.TODO,
  'in_progress': TASK_STATUS.IN_PROGRESS,
  'waiting_review': TASK_STATUS.WAITING_REVIEW,
  'blocked': TASK_STATUS.BLOCKED,
  'done': TASK_STATUS.DONE,
  'archived': TASK_STATUS.ARCHIVED,
  'rejected': TASK_STATUS.REJECTED,
};

export const ID_TO_STATUS: Record<number, string> = {
  [TASK_STATUS.TODO]: 'todo',
  [TASK_STATUS.IN_PROGRESS]: 'in_progress',
  [TASK_STATUS.WAITING_REVIEW]: 'waiting_review',
  [TASK_STATUS.BLOCKED]: 'blocked',
  [TASK_STATUS.DONE]: 'done',
  [TASK_STATUS.ARCHIVED]: 'archived',
  [TASK_STATUS.REJECTED]: 'rejected',
};

/**
 * Terminal statuses (no transitions allowed from these)
 */
export const TERMINAL_STATUSES = [TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED] as const;

/**
 * Non-terminal statuses (flexible transitions between these)
 */
export const NON_TERMINAL_STATUSES = [
  TASK_STATUS.TODO,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.WAITING_REVIEW,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.DONE,
] as const;

/**
 * Valid status transitions (v4.1.0 - relaxed rules)
 *
 * - Non-terminal statuses can freely transition to any other status (including terminal)
 * - Terminal statuses (archived, rejected) cannot transition to any status
 */
export const VALID_TRANSITIONS: Record<number, number[]> = {
  // Non-terminal: can transition to any status except self
  [TASK_STATUS.TODO]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.WAITING_REVIEW, TASK_STATUS.BLOCKED, TASK_STATUS.DONE, TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED],
  [TASK_STATUS.IN_PROGRESS]: [TASK_STATUS.TODO, TASK_STATUS.WAITING_REVIEW, TASK_STATUS.BLOCKED, TASK_STATUS.DONE, TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED],
  [TASK_STATUS.WAITING_REVIEW]: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED, TASK_STATUS.DONE, TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED],
  [TASK_STATUS.BLOCKED]: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.WAITING_REVIEW, TASK_STATUS.DONE, TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED],
  [TASK_STATUS.DONE]: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.WAITING_REVIEW, TASK_STATUS.BLOCKED, TASK_STATUS.ARCHIVED, TASK_STATUS.REJECTED],
  // Terminal: no transitions allowed
  [TASK_STATUS.ARCHIVED]: [],
  [TASK_STATUS.REJECTED]: [],
};

/**
 * File action types for task-file associations (v3.8.0)
 */
export type TaskFileActionType = 'create' | 'edit' | 'delete';

/**
 * Task file action interface (v3.8.0)
 * Specifies what action will be performed on a file for a task
 */
export interface TaskFileAction {
  action: TaskFileActionType;
  path: string;  // Relative path from project root
}

/**
 * Task creation parameters
 */
export interface TaskCreateParams {
  title: string;
  description?: string;
  acceptance_criteria?: string | any[];
  notes?: string;
  priority?: number;
  assigned_agent?: string;
  created_by_agent?: string;
  layer?: string;
  tags?: string[];
  status?: string;
  watch_files?: string[];  // DEPRECATED in v3.8.0, use file_actions
  file_actions?: TaskFileAction[];  // Array of file actions (v3.8.0) - replaces watch_files
}

/**
 * Task update parameters
 */
export interface TaskUpdateParams {
  task_id: number;
  title?: string;
  priority?: number;
  assigned_agent?: string;
  layer?: string;
  description?: string;
  acceptance_criteria?: string | any[];
  notes?: string;
  watch_files?: string[];  // DEPRECATED in v3.8.0, use file_actions
  file_actions?: TaskFileAction[];  // Array of file actions (v3.8.0) - replaces watch_files
}
