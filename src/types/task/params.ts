/**
 * Task Tool Parameter Types
 *
 * Parameter interfaces for all task management MCP tool actions.
 * Extracted from src/types.ts for better organization.
 */

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
 * Acceptance check types for automated task validation
 */
export type AcceptanceCheckType = 'tests_pass' | 'code_removed' | 'code_contains' | 'file_exists';

/**
 * Acceptance check definition
 */
export interface AcceptanceCheck {
  type: AcceptanceCheckType;
  command?: string;           // For tests_pass: shell command to execute
  expected_pattern?: string;  // For tests_pass: pattern to match in output
  file?: string;              // For code_* and file_exists: target file path
  pattern?: string;           // For code_removed/code_contains: regex pattern
  timeout?: number;           // Optional timeout in seconds (default: 60)
}

/**
 * Parameters for creating a new task
 */
export interface TaskCreateParams {
  title: string;
  description?: string;
  acceptance_criteria?: string | AcceptanceCheck[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
  priority?: number;  // 1-4 (low, medium, high, critical)
  assigned_agent?: string;
  created_by_agent?: string;
  layer?: string;
  tags?: string[];
  status?: 'todo' | 'in_progress' | 'waiting_review' | 'blocked' | 'done' | 'archived';
  watch_files?: string[];  // Array of file paths to watch (v3.4.1) - DEPRECATED in v3.8.0, use file_actions
  file_actions?: TaskFileAction[];  // Array of file actions (v3.8.0) - replaces watch_files
}

/**
 * Parameters for updating task metadata
 */
export interface TaskUpdateParams {
  task_id: number;
  title?: string;
  priority?: number;  // 1-4 (low, medium, high, critical)
  assigned_agent?: string;
  layer?: string;
  description?: string;
  acceptance_criteria?: string | AcceptanceCheck[];  // Can be string or array of AcceptanceCheck objects
  notes?: string;
  watch_files?: string[];  // Array of file paths to watch (v3.4.1) - DEPRECATED in v3.8.0, use file_actions
  file_actions?: TaskFileAction[];  // Array of file actions (v3.8.0) - replaces watch_files
}

/**
 * Parameters for getting full task details
 */
export interface TaskGetParams {
  task_id: number;
  include_dependencies?: boolean;
}

/**
 * Parameters for listing tasks
 */
export interface TaskListParams {
  status?: 'todo' | 'in_progress' | 'waiting_review' | 'blocked' | 'done' | 'archived';
  assigned_agent?: string;
  layer?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  include_dependency_counts?: boolean;
}

/**
 * Parameters for moving task to different status
 */
export interface TaskMoveParams {
  task_id: number;
  new_status: 'todo' | 'in_progress' | 'waiting_review' | 'blocked' | 'done' | 'archived';
}

/**
 * Parameters for linking task to decision/constraint/file
 */
export interface TaskLinkParams {
  task_id: number;
  link_type: 'decision' | 'constraint' | 'file';
  target_id: string | number;
  link_relation?: string;
}

/**
 * Parameters for archiving completed task
 */
export interface TaskArchiveParams {
  task_id: number;
}

/**
 * Parameters for adding task dependency
 */
export interface TaskAddDependencyParams {
  blocker_task_id: number;
  blocked_task_id: number;
}

/**
 * Parameters for removing task dependency
 */
export interface TaskRemoveDependencyParams {
  blocker_task_id: number;
  blocked_task_id: number;
}

/**
 * Parameters for getting task dependencies
 */
export interface TaskGetDependenciesParams {
  task_id: number;
  include_details?: boolean;
}

/**
 * Parameters for batch creating tasks
 */
export interface TaskBatchCreateParams {
  tasks: Array<{
    title: string;
    description?: string;
    priority?: number;
    assigned_agent?: string;
    layer?: string;
    tags?: string[];
  }>;
  atomic?: boolean;  // Default: true (all succeed or all fail)
}

/**
 * Parameters for watching/unwatching files
 */
export interface TaskWatchFilesParams {
  task_id: number;
  action: 'watch' | 'unwatch' | 'list';
  file_paths?: string[];
}

/**
 * Parameters for getting pruned files (auto-removed non-existent files)
 */
export interface TaskGetPrunedFilesParams {
  task_id: number;
  limit?: number;
}

/**
 * Parameters for linking pruned file to decision (rationale)
 */
export interface TaskLinkPrunedFileParams {
  pruned_file_id: number;
  decision_key: string;
}

/**
 * Parameters for file watcher status queries
 */
export interface TaskWatcherParams {
  subaction?: 'status' | 'files' | 'tasks' | 'help';
  task_id?: number;  // For 'tasks' subaction - get files for specific task
  file_path?: string;  // For 'files' subaction - get tasks for specific file
}
