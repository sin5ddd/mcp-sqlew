/**
 * JSON Import/Export System Types (v3.7.3)
 * Types for database import/export operations with cross-project support
 */

// ============================================================================
// JSON Import System Types (v3.7.3)
// ============================================================================

/**
 * Options for JSON import operation
 */
export interface JsonImportOptions {
  /** Optional: Target project name (if not provided, uses name from JSON) */
  targetProjectName?: string;
  /** Optional: Skip import if project already exists (default: true) */
  skipIfExists?: boolean;
  /** Optional: Dry run mode - validate only, don't import (default: false) */
  dryRun?: boolean;
}

/**
 * JSON import validation result
 */
export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  schema_version?: number;
  sqlew_version?: string;
  export_mode?: 'single_project' | 'all_projects';
}

/**
 * ID mapping for a single master table
 * Maps old IDs (from export) to new IDs (in target database)
 */
export interface IdMapping extends Map<number, number> {}

/**
 * Complete ID mapping context for all master tables
 */
export interface ImportIdMappings {
  projects: IdMapping;
  agents: IdMapping;
  files: IdMapping;
  context_keys: IdMapping;
  tags: IdMapping;
  scopes: IdMapping;
  constraint_categories: IdMapping;
  layers: IdMapping;
  task_statuses: IdMapping;
  tasks: IdMapping;  // Transaction table, but needed for dependencies
}

/**
 * Import context - holds all state during import operation
 */
export interface ImportContext {
  /** Knex instance for database operations */
  knex: any;
  /** ID mappings for all tables */
  mappings: ImportIdMappings;
  /** Target project ID (created during import) */
  projectId: number;
  /** Source JSON data */
  jsonData: any;
  /** Import options */
  options: JsonImportOptions;
  /** Statistics (updated during import) */
  stats: ImportStats;
}

/**
 * Import statistics
 */
export interface ImportStats {
  project_created: boolean;
  master_tables: {
    agents_created: number;
    files_created: number;
    files_reused: number;
    context_keys_created: number;
    tags_created: number;
    tags_reused: number;
    scopes_created: number;
    scopes_reused: number;
  };
  transaction_tables: {
    decisions_created: number;
    decisions_numeric_created: number;
    decision_history_created: number;
    decision_context_created: number;
    file_changes_created: number;
    constraints_created: number;
    tasks_created: number;
    task_details_created: number;
    activity_log_created: number;
  };
  junction_tables: {
    decision_tags_created: number;
    decision_scopes_created: number;
    constraint_tags_created: number;
    task_tags_created: number;
    task_file_links_created: number;
    task_decision_links_created: number;
    task_dependencies_created: number;
  };
}

/**
 * Task dependency graph for topological sorting
 */
export interface TaskDependencyGraph {
  /** Task IDs with no dependencies (roots) */
  roots: number[];
  /** Map from blocker_task_id to array of blocked_task_ids */
  children: Map<number, number[]>;
  /** Map from blocked_task_id to array of blocker_task_ids */
  parents: Map<number, number[]>;
  /** All task IDs in the graph */
  allTaskIds: Set<number>;
}

/**
 * JSON import result
 */
export interface JsonImportResult {
  success: boolean;
  project_id?: number;
  project_name?: string;
  stats?: ImportStats;
  error?: string;
  skipped?: boolean;
  skip_reason?: string;
}
