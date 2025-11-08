/**
 * File tool parameter types
 * Extracted from src/types.ts (lines 374-395, 473-476)
 */

/**
 * Record a single file change
 */
export interface RecordFileChangeParams {
  file_path: string;
  agent_name: string;
  change_type: 'created' | 'modified' | 'deleted';
  layer?: string;
  description?: string;
}

/**
 * Get file change history with optional filters
 */
export interface GetFileChangesParams {
  file_path?: string;
  agent_name?: string;
  layer?: string;
  change_type?: 'created' | 'modified' | 'deleted';
  since?: string;  // ISO 8601 timestamp
  limit?: number;
}

/**
 * Check if a file is locked by another agent
 */
export interface CheckFileLockParams {
  file_path: string;
  lock_duration?: number;  // Seconds (default: 300 = 5 min)
}

/**
 * Record multiple file changes in a batch operation
 */
export interface RecordFileChangeBatchParams {
  file_changes: RecordFileChangeParams[];
  atomic?: boolean;  // Default: true (all succeed or all fail)
}
