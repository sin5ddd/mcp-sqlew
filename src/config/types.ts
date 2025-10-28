/**
 * Configuration file type definitions
 * Defines the structure of .sqlew/config.toml
 */

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database file path (overrides default .sqlew/sqlew.db) */
  path?: string;
}

/**
 * Auto-deletion configuration
 */
export interface AutoDeleteConfig {
  /** Skip weekends in retention calculations */
  ignore_weekend?: boolean;
  /** Message retention period in hours */
  message_hours?: number;
  /** File change history retention in days */
  file_history_days?: number;
}

/**
 * Task management configuration
 */
export interface TaskConfig {
  /** Auto-archive done tasks after N days */
  auto_archive_done_days?: number;
  /** Stale detection threshold for in_progress tasks (hours) */
  stale_hours_in_progress?: number;
  /** Stale detection threshold for waiting_review tasks (hours) */
  stale_hours_waiting_review?: number;
  /** Enable automatic stale detection */
  auto_stale_enabled?: boolean;
  /** Idle time in minutes before checking for review readiness */
  review_idle_minutes?: number;
  /** Require all watched files to be modified before review */
  review_require_all_files_modified?: boolean;
  /** Require tests to pass before review */
  review_require_tests_pass?: boolean;
  /** Require TypeScript to compile before review */
  review_require_compile?: boolean;
}

/**
 * Debug logging configuration (v3.5.4)
 */
export interface DebugConfig {
  /** Debug log file path (environment variable SQLEW_DEBUG takes precedence) */
  log_path?: string;
  /** Log level: "error", "warn", "info", "debug" (case-insensitive, default: "info") */
  log_level?: string;
}

/**
 * Specialized agents configuration
 */
export interface AgentsConfig {
  /** Install Scrum Master agent (coordination, tasks, sprints) - ~12KB tokens */
  scrum_master?: boolean;
  /** Install Researcher agent (query decisions, analyze patterns) - ~14KB tokens */
  researcher?: boolean;
  /** Install Architect agent (document decisions, enforce constraints) - ~20KB tokens */
  architect?: boolean;
}

/**
 * Complete configuration structure
 * Maps to .sqlew/config.toml sections
 */
export interface SqlewConfig {
  /** Database settings */
  database?: DatabaseConfig;
  /** Auto-deletion settings */
  autodelete?: AutoDeleteConfig;
  /** Task management settings */
  tasks?: TaskConfig;
  /** Debug logging settings */
  debug?: DebugConfig;
  /** Specialized agents settings */
  agents?: AgentsConfig;
}

/**
 * Flattened configuration (database format)
 * Maps TOML sections to flat key-value pairs
 */
export interface FlatConfig {
  // Auto-deletion
  autodelete_ignore_weekend?: boolean;
  autodelete_message_hours?: number;
  autodelete_file_history_days?: number;

  // Tasks
  auto_archive_done_days?: number;
  task_stale_hours_in_progress?: number;
  task_stale_hours_waiting_review?: number;
  task_auto_stale_enabled?: boolean;

  // Quality-based review detection
  review_idle_minutes?: number;
  review_require_all_files_modified?: boolean;
  review_require_tests_pass?: boolean;
  review_require_compile?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: SqlewConfig = {
  database: {
    // No default path - uses DEFAULT_DB_PATH from constants
  },
  autodelete: {
    ignore_weekend: false,
    message_hours: 24,
    file_history_days: 7,
  },
  tasks: {
    auto_archive_done_days: 2,
    stale_hours_in_progress: 2,
    stale_hours_waiting_review: 24,
    auto_stale_enabled: true,
    review_idle_minutes: 15,
    review_require_all_files_modified: true,
    review_require_tests_pass: true,
    review_require_compile: true,
  },
  agents: {
    scrum_master: true,
    researcher: true,
    architect: true,
  },
};
