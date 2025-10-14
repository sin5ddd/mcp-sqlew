/**
 * Type definitions for MCP Shared Context Server
 * Database entity interfaces and enum types
 */

import { Database } from 'better-sqlite3';

// ============================================================================
// Enums (matching schema integer values)
// ============================================================================

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

// ============================================================================
// Master Table Entities
// ============================================================================

export interface Agent {
  readonly id: number;
  readonly name: string;
}

export interface File {
  readonly id: number;
  readonly path: string;
}

export interface ContextKey {
  readonly id: number;
  readonly key: string;
}

export interface ConstraintCategory {
  readonly id: number;
  readonly name: string;
}

export interface Layer {
  readonly id: number;
  readonly name: string;
}

export interface Tag {
  readonly id: number;
  readonly name: string;
}

export interface Scope {
  readonly id: number;
  readonly name: string;
}

// ============================================================================
// Transaction Table Entities
// ============================================================================

export interface Decision {
  readonly key_id: number;
  readonly value: string;
  readonly agent_id: number | null;
  readonly layer_id: number | null;
  readonly version: string;
  readonly status: Status;
  readonly ts: number;
}

export interface DecisionNumeric {
  readonly key_id: number;
  readonly value: number;
  readonly agent_id: number | null;
  readonly layer_id: number | null;
  readonly version: string;
  readonly status: Status;
  readonly ts: number;
}

export interface DecisionHistory {
  readonly id: number;
  readonly key_id: number;
  readonly version: string;
  readonly value: string;
  readonly agent_id: number | null;
  readonly ts: number;
}

export interface DecisionTag {
  readonly decision_key_id: number;
  readonly tag_id: number;
}

export interface DecisionScope {
  readonly decision_key_id: number;
  readonly scope_id: number;
}

export interface AgentMessage {
  readonly id: number;
  readonly from_agent_id: number;
  readonly to_agent_id: number | null;  // NULL = broadcast
  readonly msg_type: MessageType;
  readonly priority: Priority;
  readonly payload: string | null;  // JSON string
  readonly ts: number;
  readonly read: number;  // SQLite boolean: 0 or 1
}

export interface FileChange {
  readonly id: number;
  readonly file_id: number;
  readonly agent_id: number;
  readonly layer_id: number | null;
  readonly change_type: ChangeType;
  readonly description: string | null;
  readonly ts: number;
}

export interface Constraint {
  readonly id: number;
  readonly category_id: number;
  readonly layer_id: number | null;
  readonly constraint_text: string;
  readonly priority: Priority;
  readonly active: number;  // SQLite boolean: 0 or 1
  readonly created_by: number | null;
  readonly ts: number;
}

export interface ConstraintTag {
  readonly constraint_id: number;
  readonly tag_id: number;
}

export interface ActivityLog {
  readonly id: number;
  readonly ts: number;
  readonly agent_id: number;
  readonly action_type: string;  // 'decision_set', 'decision_update', 'message_send', 'file_record'
  readonly target: string;
  readonly layer_id: number | null;
  readonly details: string | null;  // JSON string
}

export interface DecisionTemplate {
  readonly id: number;
  readonly name: string;
  readonly defaults: string;  // JSON string: {layer, status, tags, priority}
  readonly required_fields: string | null;  // JSON array: ["cve_id", "severity"]
  readonly created_by: number | null;
  readonly ts: number;
}

// ============================================================================
// View Result Types
// ============================================================================

export interface TaggedDecision {
  readonly key: string;
  readonly value: string;
  readonly version: string;
  readonly status: 'active' | 'deprecated' | 'draft';
  readonly layer: string | null;
  readonly tags: string | null;  // Comma-separated
  readonly scopes: string | null;  // Comma-separated
  readonly decided_by: string | null;
  readonly updated: string;  // ISO 8601 datetime
}

export interface ActiveContext {
  readonly key: string;
  readonly value: string;
  readonly version: string;
  readonly layer: string | null;
  readonly decided_by: string | null;
  readonly updated: string;  // ISO 8601 datetime
}

export interface LayerSummary {
  readonly layer: string;
  readonly decisions_count: number;
  readonly file_changes_count: number;
  readonly constraints_count: number;
}

export interface UnreadMessagesByPriority {
  readonly agent: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly count: number;
}

export interface RecentFileChange {
  readonly path: string;
  readonly changed_by: string;
  readonly layer: string | null;
  readonly change_type: 'created' | 'modified' | 'deleted';
  readonly description: string | null;
  readonly changed_at: string;  // ISO 8601 datetime
}

export interface TaggedConstraint {
  readonly id: number;
  readonly category: string;
  readonly layer: string | null;
  readonly constraint_text: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly tags: string | null;  // Comma-separated
  readonly created_by: string | null;
  readonly created_at: string;  // ISO 8601 datetime
}

// ============================================================================
// MCP Tool Parameter Types
// ============================================================================

export interface SetDecisionParams {
  key: string;
  value: string | number;
  agent?: string;
  layer?: string;
  version?: string;
  status?: 'active' | 'deprecated' | 'draft';
  tags?: string[];
  scopes?: string[];
}

export interface QuickSetDecisionParams {
  key: string;
  value: string | number;
  agent?: string;
  layer?: string;
  version?: string;
  status?: 'active' | 'deprecated' | 'draft';
  tags?: string[];
  scopes?: string[];
}

export interface GetContextParams {
  tags?: string[];
  layer?: string;
  status?: 'active' | 'deprecated' | 'draft';
  scope?: string;
  tag_match?: 'AND' | 'OR';
}

export interface GetDecisionParams {
  key: string;
}

export interface SearchByTagsParams {
  tags: string[];
  match_mode?: 'AND' | 'OR';
  status?: 'active' | 'deprecated' | 'draft';
  layer?: string;
}

export interface GetVersionsParams {
  key: string;
}

export interface SearchByLayerParams {
  layer: string;
  status?: 'active' | 'deprecated' | 'draft';
  include_tags?: boolean;
}

export interface SearchAdvancedParams {
  layers?: string[];  // OR relationship - match any
  tags_all?: string[];  // AND relationship - must have ALL
  tags_any?: string[];  // OR relationship - must have ANY
  exclude_tags?: string[];  // Exclude these tags
  scopes?: string[];  // Wildcard support (e.g., "api/instruments/*")
  updated_after?: string;  // ISO timestamp or relative time ("7d")
  updated_before?: string;  // ISO timestamp or relative time
  decided_by?: string[];  // Array of agent names
  statuses?: ('active' | 'deprecated' | 'draft')[];  // Multiple statuses
  search_text?: string;  // Full-text search in value field
  sort_by?: 'updated' | 'key' | 'version';
  sort_order?: 'asc' | 'desc';
  limit?: number;  // Max results (default: 20)
  offset?: number;  // For pagination (default: 0)
}

export interface HasUpdatesParams {
  agent_name: string;
  since_timestamp: string;  // ISO 8601 timestamp
}

export interface SendMessageParams {
  from_agent: string;
  to_agent?: string | null;  // undefined or null = broadcast
  msg_type: 'decision' | 'warning' | 'request' | 'info';
  message: string;  // The message content
  priority?: 'low' | 'medium' | 'high' | 'critical';
  payload?: any;  // Will be JSON.stringify'd
}

export interface GetMessagesParams {
  agent_name: string;
  unread_only?: boolean;
  priority_filter?: 'low' | 'medium' | 'high' | 'critical';
  msg_type_filter?: 'decision' | 'warning' | 'request' | 'info';
  limit?: number;
}

export interface MarkReadParams {
  message_ids: number[];
  agent_name: string;
}

export interface RecordFileChangeParams {
  file_path: string;
  agent_name: string;
  change_type: 'created' | 'modified' | 'deleted';
  layer?: string;
  description?: string;
}

export interface GetFileChangesParams {
  file_path?: string;
  agent_name?: string;
  layer?: string;
  change_type?: 'created' | 'modified' | 'deleted';
  since?: string;  // ISO 8601 timestamp
  limit?: number;
}

export interface CheckFileLockParams {
  file_path: string;
  lock_duration?: number;  // Seconds (default: 300 = 5 min)
}

export interface AddConstraintParams {
  category: string;
  constraint_text: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  layer?: string;
  tags?: string[];
  created_by?: string;
}

export interface GetConstraintsParams {
  category?: string;
  layer?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  active_only?: boolean;
  limit?: number;
}

export interface DeactivateConstraintParams {
  constraint_id: number;
}

export interface GetLayerSummaryParams {
  // No parameters - returns all layers
}

export interface ClearOldDataParams {
  messages_older_than_hours?: number;
  file_changes_older_than_days?: number;
}

export interface GetStatsParams {
  // No parameters - returns overall stats
}

export interface GetActivityLogParams {
  since?: string;  // ISO timestamp or relative like "5m", "1h", "2h", "1d"
  agent_names?: string[];  // Filter by agents (or ["*"] for all)
  actions?: string[];  // Filter by action types
  limit?: number;  // Max results (default: 100)
}

// ============================================================================
// Batch Operation Parameter Types (FR-005)
// ============================================================================

export interface SetDecisionBatchParams {
  decisions: SetDecisionParams[];
  atomic?: boolean;  // Default: true (all succeed or all fail)
}

export interface SendMessageBatchParams {
  messages: SendMessageParams[];
  atomic?: boolean;  // Default: true (all succeed or all fail)
}

export interface RecordFileChangeBatchParams {
  file_changes: RecordFileChangeParams[];
  atomic?: boolean;  // Default: true (all succeed or all fail)
}

// ============================================================================
// Decision Template Parameter Types (FR-006)
// ============================================================================

export interface SetFromTemplateParams {
  template: string;  // Template name
  key: string;
  value: string | number;
  agent?: string;
  // Override template defaults if needed
  layer?: string;
  version?: string;
  status?: 'active' | 'deprecated' | 'draft';
  tags?: string[];
  scopes?: string[];
  // Required fields (template-specific)
  [key: string]: any;
}

export interface CreateTemplateParams {
  name: string;
  defaults: {
    layer?: string;
    status?: 'active' | 'deprecated' | 'draft';
    tags?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
  required_fields?: string[];
  created_by?: string;
}

export interface ListTemplatesParams {
  // No parameters - returns all templates
}

// ============================================================================
// MCP Tool Response Types
// ============================================================================

export interface SetDecisionResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  message?: string;
}

export interface QuickSetDecisionResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  inferred: {
    layer?: string;
    tags?: string[];
    scope?: string;
  };
  message?: string;
}

export interface GetContextResponse {
  decisions: TaggedDecision[];
  count: number;
}

export interface GetDecisionResponse {
  found: boolean;
  decision?: TaggedDecision;
}

export interface SearchByTagsResponse {
  decisions: TaggedDecision[];
  count: number;
}

export interface GetVersionsResponse {
  key: string;
  history: Array<{
    version: string;
    value: string;
    agent: string | null;
    timestamp: string;
  }>;
  count: number;
}

export interface SearchByLayerResponse {
  layer: string;
  decisions: TaggedDecision[];
  count: number;
}

export interface SearchAdvancedResponse {
  decisions: TaggedDecision[];
  count: number;
  total_count: number;  // Total matching records (for pagination)
}

export interface HasUpdatesResponse {
  has_updates: boolean;
  counts: {
    decisions: number;
    messages: number;
    files: number;
  };
}

export interface SendMessageResponse {
  success: boolean;
  message_id: number;
}

export interface GetMessagesResponse {
  messages: Array<{
    id: number;
    from_agent: string;
    msg_type: string;
    priority: string;
    payload: any;
    timestamp: string;
    read: boolean;
  }>;
  count: number;
}

export interface MarkReadResponse {
  success: boolean;
}

export interface RecordFileChangeResponse {
  success: boolean;
  change_id: number;
  timestamp: string;
}

export interface GetFileChangesResponse {
  changes: RecentFileChange[];
  count: number;
}

export interface CheckFileLockResponse {
  locked: boolean;
  last_agent?: string;
  last_change?: string;
  change_type?: string;
}

export interface AddConstraintResponse {
  success: boolean;
  constraint_id: number;
}

export interface GetConstraintsResponse {
  constraints: TaggedConstraint[];
  count: number;
}

export interface DeactivateConstraintResponse {
  success: boolean;
}

export interface GetLayerSummaryResponse {
  summary: LayerSummary[];
}

export interface ClearOldDataResponse {
  success: boolean;
  messages_deleted: number;
  file_changes_deleted: number;
  activity_logs_deleted: number;
}

export interface GetStatsResponse {
  agents: number;
  files: number;
  context_keys: number;
  active_decisions: number;
  total_decisions: number;
  messages: number;
  file_changes: number;
  active_constraints: number;
  total_constraints: number;
  tags: number;
  scopes: number;
  layers: number;
}

export interface ActivityLogEntry {
  id: number;
  timestamp: string;  // ISO 8601
  agent: string;
  action: string;
  target: string;
  layer: string | null;
  details: any;  // Parsed JSON
}

export interface GetActivityLogResponse {
  activities: ActivityLogEntry[];
  count: number;
}

// ============================================================================
// Batch Operation Response Types (FR-005)
// ============================================================================

export interface SetDecisionBatchResponse {
  success: boolean;
  inserted: number;
  failed: number;
  results: Array<{
    key: string;
    key_id?: number;
    version?: string;
    success: boolean;
    error?: string;
  }>;
}

export interface SendMessageBatchResponse {
  success: boolean;
  inserted: number;
  failed: number;
  results: Array<{
    from_agent: string;
    to_agent: string | null;
    message_id?: number;
    timestamp?: string;
    success: boolean;
    error?: string;
  }>;
}

export interface RecordFileChangeBatchResponse {
  success: boolean;
  inserted: number;
  failed: number;
  results: Array<{
    file_path: string;
    change_id?: number;
    timestamp?: string;
    success: boolean;
    error?: string;
  }>;
}

// ============================================================================
// Decision Template Response Types (FR-006)
// ============================================================================

export interface SetFromTemplateResponse {
  success: boolean;
  key: string;
  key_id: number;
  version: string;
  template_used: string;
  applied_defaults: {
    layer?: string;
    tags?: string[];
    status?: string;
  };
  message?: string;
}

export interface CreateTemplateResponse {
  success: boolean;
  template_id: number;
  template_name: string;
  message?: string;
}

export interface ListTemplatesResponse {
  templates: Array<{
    id: number;
    name: string;
    defaults: any;  // Parsed JSON
    required_fields: string[] | null;  // Parsed JSON array
    created_by: string | null;
    created_at: string;
  }>;
  count: number;
}

// ============================================================================
// Database Connection Type
// ============================================================================

export type { Database };
