/**
 * Constants for MCP Shared Context Server
 * Enum mappings, default values, and standard data
 */

import { Status, MessageType, Priority, ChangeType } from './types.js';

// ============================================================================
// Database Configuration
// ============================================================================

/**
 * Default database folder (relative to project root)
 */
export const DEFAULT_DB_FOLDER = '.sqlew';

/**
 * Default database file name
 */
export const DEFAULT_DB_FILENAME = 'sqlew.db';

/**
 * Default database path (relative to project root)
 */
export const DEFAULT_DB_PATH = `${DEFAULT_DB_FOLDER}/${DEFAULT_DB_FILENAME}`;

/**
 * Database busy timeout (milliseconds)
 */
export const DB_BUSY_TIMEOUT = 5000;

// ============================================================================
// Enum String Mappings
// ============================================================================

/**
 * Map status integer to string
 */
export const STATUS_TO_STRING: Record<Status, string> = {
  [Status.ACTIVE]: 'active',
  [Status.DEPRECATED]: 'deprecated',
  [Status.DRAFT]: 'draft',
};

/**
 * Map status string to integer
 */
export const STRING_TO_STATUS: Record<string, Status> = {
  'active': Status.ACTIVE,
  'deprecated': Status.DEPRECATED,
  'draft': Status.DRAFT,
};

/**
 * Map message type integer to string
 */
export const MESSAGE_TYPE_TO_STRING: Record<MessageType, string> = {
  [MessageType.DECISION]: 'decision',
  [MessageType.WARNING]: 'warning',
  [MessageType.REQUEST]: 'request',
  [MessageType.INFO]: 'info',
};

/**
 * Map message type string to integer
 */
export const STRING_TO_MESSAGE_TYPE: Record<string, MessageType> = {
  'decision': MessageType.DECISION,
  'warning': MessageType.WARNING,
  'request': MessageType.REQUEST,
  'info': MessageType.INFO,
};

/**
 * Map priority integer to string
 */
export const PRIORITY_TO_STRING: Record<Priority, string> = {
  [Priority.LOW]: 'low',
  [Priority.MEDIUM]: 'medium',
  [Priority.HIGH]: 'high',
  [Priority.CRITICAL]: 'critical',
};

/**
 * Map priority string to integer
 */
export const STRING_TO_PRIORITY: Record<string, Priority> = {
  'low': Priority.LOW,
  'medium': Priority.MEDIUM,
  'high': Priority.HIGH,
  'critical': Priority.CRITICAL,
};

/**
 * Map change type integer to string
 */
export const CHANGE_TYPE_TO_STRING: Record<ChangeType, string> = {
  [ChangeType.CREATED]: 'created',
  [ChangeType.MODIFIED]: 'modified',
  [ChangeType.DELETED]: 'deleted',
};

/**
 * Map change type string to integer
 */
export const STRING_TO_CHANGE_TYPE: Record<string, ChangeType> = {
  'created': ChangeType.CREATED,
  'modified': ChangeType.MODIFIED,
  'deleted': ChangeType.DELETED,
};

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default version for new decisions
 */
export const DEFAULT_VERSION = '1.0.0';

/**
 * Default status for new decisions
 */
export const DEFAULT_STATUS = Status.ACTIVE;

/**
 * Default priority for messages and constraints
 */
export const DEFAULT_PRIORITY = Priority.MEDIUM;

/**
 * Default active state for constraints
 */
export const DEFAULT_ACTIVE = 1;

// ============================================================================
// Time Constants (seconds)
// ============================================================================

/**
 * 1 hour in seconds
 */
export const ONE_HOUR = 3600;

/**
 * 24 hours in seconds
 */
export const ONE_DAY = 86400;

/**
 * 7 days in seconds
 */
export const ONE_WEEK = 604800;

/**
 * Default retention period for messages (24 hours)
 */
export const MESSAGE_RETENTION_SECONDS = ONE_DAY;

/**
 * Default retention period for file changes (7 days)
 */
export const FILE_CHANGE_RETENTION_SECONDS = ONE_WEEK;

/**
 * Default active context window (1 hour)
 */
export const ACTIVE_CONTEXT_WINDOW_SECONDS = ONE_HOUR;

// ============================================================================
// Standard Layers
// ============================================================================

/**
 * Standard architecture layers
 */
export const STANDARD_LAYERS = [
  'presentation',
  'business',
  'data',
  'infrastructure',
  'cross-cutting',
] as const;

export type StandardLayer = typeof STANDARD_LAYERS[number];

// ============================================================================
// Standard Categories
// ============================================================================

/**
 * Standard constraint categories
 */
export const STANDARD_CATEGORIES = [
  'performance',
  'architecture',
  'security',
] as const;

export type StandardCategory = typeof STANDARD_CATEGORIES[number];

// ============================================================================
// Common Tags
// ============================================================================

/**
 * Common tags for decisions and constraints
 */
export const COMMON_TAGS = [
  'authentication',
  'authorization',
  'performance',
  'security',
  'api',
  'database',
  'caching',
  'testing',
  'validation',
  'error-handling',
] as const;

export type CommonTag = typeof COMMON_TAGS[number];

// ============================================================================
// Query Defaults
// ============================================================================

/**
 * Default limit for query results
 */
export const DEFAULT_QUERY_LIMIT = 100;

/**
 * Default tag match mode
 */
export const DEFAULT_TAG_MATCH_MODE = 'OR';

/**
 * Default hours to look back for file changes
 */
export const DEFAULT_FILE_CHANGES_HOURS = 24;

// ============================================================================
// SQLite Constants
// ============================================================================

/**
 * SQLite boolean true value
 */
export const SQLITE_TRUE = 1;

/**
 * SQLite boolean false value
 */
export const SQLITE_FALSE = 0;

// ============================================================================
// Configuration Keys
// ============================================================================

/**
 * Configuration key names
 */
export const CONFIG_KEYS = {
  AUTODELETE_IGNORE_WEEKEND: 'autodelete_ignore_weekend',
  AUTODELETE_MESSAGE_HOURS: 'autodelete_message_hours',
  AUTODELETE_FILE_HISTORY_DAYS: 'autodelete_file_history_days',
  AUTO_ARCHIVE_DONE_DAYS: 'auto_archive_done_days',
  REVIEW_IDLE_MINUTES: 'review_idle_minutes',
  REVIEW_REQUIRE_ALL_FILES_MODIFIED: 'review_require_all_files_modified',
  REVIEW_REQUIRE_TESTS_PASS: 'review_require_tests_pass',
  REVIEW_REQUIRE_COMPILE: 'review_require_compile',
  // v3.5.2: Two-step Git-aware workflow
  GIT_AUTO_COMPLETE_ON_STAGE: 'git_auto_complete_on_stage',
  GIT_AUTO_ARCHIVE_ON_COMMIT: 'git_auto_archive_on_commit',
  REQUIRE_ALL_FILES_STAGED: 'require_all_files_staged',
  REQUIRE_ALL_FILES_COMMITTED_FOR_ARCHIVE: 'require_all_files_committed_for_archive',
} as const;

// ============================================================================
// Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  DB_INIT_FAILED: 'Failed to initialize database',
  DB_CONNECTION_FAILED: 'Failed to connect to database',
  SCHEMA_INIT_FAILED: 'Failed to initialize schema',
  INVALID_ENUM_VALUE: 'Invalid enum value',
  FOREIGN_KEY_VIOLATION: 'Foreign key constraint violation',
  UNIQUE_CONSTRAINT_VIOLATION: 'Unique constraint violation',
  INVALID_PARAMETER: 'Invalid parameter',
  DECISION_NOT_FOUND: 'Decision not found',
  MESSAGE_NOT_FOUND: 'Message not found',
  CONSTRAINT_NOT_FOUND: 'Constraint not found',
  AGENT_NOT_FOUND: 'Agent not found',
  FILE_NOT_FOUND: 'File not found',
  LAYER_NOT_FOUND: 'Layer not found',
  TAG_NOT_FOUND: 'Tag not found',
  SCOPE_NOT_FOUND: 'Scope not found',
} as const;
