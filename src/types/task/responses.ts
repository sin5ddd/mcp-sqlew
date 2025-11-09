/**
 * Task Tool Response Types
 *
 * Response interfaces for all task management MCP tool actions.
 * Extracted from src/types.ts for better organization.
 */

/**
 * Response for task create action
 */
export interface TaskCreateResponse {
  success: boolean;
  task_id: number;
  title: string;
  status: string;
  message: string;
}

/**
 * Response for task update action
 */
export interface TaskUpdateResponse {
  success: boolean;
  task_id: number;
  message: string;
}

/**
 * Task detail object returned by get action
 */
export interface TaskDetail {
  id: number;
  title: string;
  status: string;
  priority: number;
  assigned_agent: string | null;
  created_by_agent: string;
  layer: string | null;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
  description?: string | null;
  acceptance_criteria?: string | null;
  acceptance_criteria_json?: string | null;  // JSON array of AcceptanceCheck objects
  notes?: string | null;
  tags: string[];
  linked_decisions: Array<{
    key: string;
    link_type: string;
  }>;
  linked_constraints: Array<{
    id: number;
    constraint_text: string;
  }>;
  linked_files: string[];
  dependencies?: {
    blockers: Array<{
      id: number;
      title: string;
      status: string;
    }>;
    blocking: Array<{
      id: number;
      title: string;
      status: string;
    }>;
  };
}

/**
 * Response for task get action
 */
export interface TaskGetResponse {
  found: boolean;
  task_id?: number;  // Only present if not found
  task?: TaskDetail;
}

/**
 * Task summary object returned by list action
 */
export interface TaskSummary {
  id: number;
  title: string;
  status: string;
  priority: number;
  assigned_agent: string | null;
  created_by_agent: string;
  layer: string | null;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
  tags?: string[];  // Only if task has tags
  dependency_count?: number;  // Only if include_dependency_counts=true
}

/**
 * Response for task list action
 */
export interface TaskListResponse {
  tasks: TaskSummary[];
  count: number;
  stale_tasks_transitioned: number;
  git_auto_completed: number;
  git_archived: number;
  archived_tasks: number;
}

/**
 * Response for task move action
 */
export interface TaskMoveResponse {
  success: boolean;
  task_id: number;
  old_status: string;
  new_status: string;
  message: string;
}

/**
 * Response for task link action (decision)
 */
export interface TaskLinkDecisionResponse {
  success: boolean;
  task_id: number;
  linked_to: 'decision';
  target: string;  // decision key
  relation: string;
  message: string;
}

/**
 * Response for task link action (constraint)
 */
export interface TaskLinkConstraintResponse {
  success: boolean;
  task_id: number;
  linked_to: 'constraint';
  target: number;  // constraint id
  message: string;
}

/**
 * Response for task link action (file) - DEPRECATED
 */
export interface TaskLinkFileResponse {
  success: boolean;
  task_id: number;
  linked_to: 'file';
  target: string;  // file path
  deprecation_warning: string;
  message: string;
}

/**
 * Union type for all task link responses
 */
export type TaskLinkResponse = TaskLinkDecisionResponse | TaskLinkConstraintResponse | TaskLinkFileResponse;

/**
 * Response for task archive action
 */
export interface TaskArchiveResponse {
  success: boolean;
  task_id: number;
  message: string;
}

/**
 * Response for task add_dependency action
 */
export interface TaskAddDependencyResponse {
  success: boolean;
  message: string;
}

/**
 * Response for task remove_dependency action
 */
export interface TaskRemoveDependencyResponse {
  success: boolean;
  message: string;
}

/**
 * Dependency detail for get_dependencies action
 */
export interface TaskDependencyDetail {
  id: number;
  title: string;
  status: string;
  priority?: number;
  assigned_agent?: string | null;
  layer?: string | null;
}

/**
 * Response for task get_dependencies action
 */
export interface TaskGetDependenciesResponse {
  task_id: number;
  blockers: TaskDependencyDetail[];
  blocking: TaskDependencyDetail[];
}

/**
 * Batch create result item
 */
export interface TaskBatchCreateResultItem {
  success: boolean;
  task_id?: number;
  title?: string;
  status?: string;
  error?: string;
}

/**
 * Response for task create_batch action
 */
export interface TaskBatchCreateResponse {
  success: boolean;
  created: number;
  failed: number;
  results: TaskBatchCreateResultItem[];
}

/**
 * Response for task watch_files action (watch)
 */
export interface TaskWatchFilesWatchResponse {
  success: boolean;
  task_id: number;
  action: 'watch';
  files_added: number;
  files: string[];
  message: string;
}

/**
 * Response for task watch_files action (unwatch)
 */
export interface TaskWatchFilesUnwatchResponse {
  success: boolean;
  task_id: number;
  action: 'unwatch';
  files_removed: number;
  files: string[];
  message: string;
}

/**
 * Response for task watch_files action (list)
 */
export interface TaskWatchFilesListResponse {
  success: boolean;
  task_id: number;
  action: 'list';
  files_count: number;
  files: string[];
  message: string;
}

/**
 * Union type for all watch_files responses
 */
export type TaskWatchFilesResponse =
  | TaskWatchFilesWatchResponse
  | TaskWatchFilesUnwatchResponse
  | TaskWatchFilesListResponse;

/**
 * Pruned file entry
 */
export interface PrunedFileEntry {
  id: number;
  file_path: string;
  task_id: number;
  pruned_at: string;  // ISO 8601
  linked_decision_key: string | null;
}

/**
 * Response for task get_pruned_files action
 */
export interface TaskGetPrunedFilesResponse {
  success: boolean;
  task_id: number;
  pruned_files: PrunedFileEntry[];
  count: number;
  message: string;
}

/**
 * Response for task link_pruned_file action
 */
export interface TaskLinkPrunedFileResponse {
  success: boolean;
  pruned_file_id: number;
  decision_key: string;
  task_id: number;
  file_path: string;
  message: string;
}

/**
 * File watcher status info
 */
export interface FileWatcherStatus {
  running: boolean;
  files_watched: number;
  tasks_monitored: number;
}

/**
 * File watcher file entry
 */
export interface WatchedFileEntry {
  file_path: string;
  task_count: number;
  tasks: Array<{
    task_id: number;
    title: string;
    status: string;
  }>;
}

/**
 * File watcher task entry
 */
export interface WatchedTaskEntry {
  task_id: number;
  title: string;
  status: string;
  file_count: number;
  files: string[];
}

/**
 * Response for task watcher action (status subaction)
 */
export interface TaskWatcherStatusResponse {
  success: boolean;
  watcher_status: FileWatcherStatus;
  message: string;
}

/**
 * Response for task watcher action (list_files subaction)
 */
export interface TaskWatcherListFilesResponse {
  success: boolean;
  files_watched: number;
  files: WatchedFileEntry[];
  message: string;
}

/**
 * Response for task watcher action (list_tasks subaction)
 */
export interface TaskWatcherListTasksResponse {
  success: boolean;
  tasks_monitored: number;
  tasks: WatchedTaskEntry[];
  message: string;
}

/**
 * Union type for all watcher responses
 */
export type TaskWatcherResponse =
  | TaskWatcherStatusResponse
  | TaskWatcherListFilesResponse
  | TaskWatcherListTasksResponse;
