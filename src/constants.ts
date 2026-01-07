/**
 * Constants for MCP Shared Context Server
 * Enum mappings, default values, and standard data
 */

import { Status, MessageType, Priority } from './types.js';

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
// Suggestion & Duplicate Detection (v3.9.0)
// ============================================================================

/**
 * Suggestion score thresholds for duplicate detection (Three-Tier System)
 *
 * v3.9.0: Two-tier system (35/60) - gentle nudge + hard block
 * v3.9.1: Three-tier system (45/60) - AI-friendly auto-update
 *
 * Tier 1 (35-44): Gentle nudge - non-blocking warning (ignored by AI, 10-20% effective)
 * Tier 2 (45-59): Hard block - forces manual decision (95% effective but requires retry)
 * Tier 3 (60+):   Auto-update - transparent update of existing decision (AI-friendly, no retry)
 *
 * Score breakdown:
 * - 45-49: 2 tags + layer OR 1 tag + layer + high similarity → Hard block
 * - 50-59: 2 tags + layer + some similarity → Hard block
 * - 60-69: 3 tags + layer OR 2 tags + layer + high similarity → Auto-update
 * - 70+:   3+ tags + layer + similar key/value → Auto-update
 */
export const SUGGEST_THRESHOLDS = {
  GENTLE_NUDGE: 35,       // Warning threshold (non-blocking, Tier 1)
  HARD_BLOCK: 45,         // Blocking threshold (forces choice, Tier 2)
  AUTO_UPDATE: 60,        // Auto-update threshold (transparent update, Tier 3)
  CHECK_DUPLICATE: 50,    // Used by suggest.check_duplicate action
} as const;

/**
 * Suggestion limits for response optimization
 */
export const SUGGEST_LIMITS = {
  MAX_SUGGESTIONS_NUDGE: 3,      // Max suggestions in gentle nudge warning
  MAX_SUGGESTIONS_BLOCK: 1,      // Max suggestions in blocking error
  VERSION_HISTORY_COUNT: 2,      // Recent versions to show in preview
} as const;

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
  [Status.IN_PROGRESS]: 'in_progress',
  [Status.IN_REVIEW]: 'in_review',
  [Status.IMPLEMENTED]: 'implemented',
};

/**
 * Map status string to integer
 */
export const STRING_TO_STATUS: Record<string, Status> = {
  'active': Status.ACTIVE,
  'deprecated': Status.DEPRECATED,
  'draft': Status.DRAFT,
  'in_progress': Status.IN_PROGRESS,
  'in_review': Status.IN_REVIEW,
  'implemented': Status.IMPLEMENTED,
};

/**
 * Valid status values for error messages
 */
export const VALID_STATUSES = Object.keys(STRING_TO_STATUS);

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
 * Default active context window (1 hour)
 */
export const ACTIVE_CONTEXT_WINDOW_SECONDS = ONE_HOUR;

// ============================================================================
// Standard Layers
// ============================================================================

/**
 * Standard architecture layers (expanded in v3.8.0)
 * - Original 5: presentation, business, data, infrastructure, cross-cutting
 * - Planning 4: planning, documentation, coordination, review
 */
export const STANDARD_LAYERS = [
  'presentation',
  'business',
  'data',
  'infrastructure',
  'cross-cutting',
  'planning',
  'documentation',
  'coordination',
  'review',
] as const;

export type StandardLayer = typeof STANDARD_LAYERS[number];

/**
 * Layers that require file_actions parameter (v3.8.0)
 * These layers represent code or documentation files that must be tracked
 */
export const FILE_REQUIRED_LAYERS = [
  'presentation',
  'business',
  'data',
  'infrastructure',
  'cross-cutting',
  'documentation',  // Documentation IS files (README, CHANGELOG, docs/)
] as const;

/**
 * Layers where file_actions is optional (v3.8.0)
 * These layers represent planning, coordination, and review work
 */
export const FILE_OPTIONAL_LAYERS = [
  'planning',      // Research, surveys, investigation
  'coordination',  // Multi-agent orchestration
  'review',        // Code review, verification
] as const;

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
  LAYER_NOT_FOUND: 'Layer not found',
  TAG_NOT_FOUND: 'Tag not found',
  SCOPE_NOT_FOUND: 'Scope not found',
} as const;
