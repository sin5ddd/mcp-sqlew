/**
 * Enumeration types for MCP Shared Context Server
 * All enums use integer values matching database schema
 */

/**
 * Decision status enumeration
 * 1 = active, 2 = deprecated, 3 = draft
 */
export enum Status {
  ACTIVE = 1,
  DEPRECATED = 2,
  DRAFT = 3,
}

/**
 * Message type enumeration
 * 1 = decision, 2 = warning, 3 = request, 4 = info
 */
export enum MessageType {
  DECISION = 1,
  WARNING = 2,
  REQUEST = 3,
  INFO = 4,
}

/**
 * Priority level enumeration
 * 1 = low, 2 = medium, 3 = high, 4 = critical
 */
export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * File change type enumeration
 * 1 = created, 2 = modified, 3 = deleted
 */
export enum ChangeType {
  CREATED = 1,
  MODIFIED = 2,
  DELETED = 3,
}
