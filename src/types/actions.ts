/**
 * MCP Tool Action Types
 * String literal unions for compile-time safety without breaking MCP wire protocol
 */

// ============================================================================
// MCP Tool Action Types (String Literal Unions for Compile-Time Safety)
// ============================================================================

/**
 * Decision tool actions
 * Provides compile-time type checking for action parameters without breaking MCP wire protocol
 */
export type DecisionAction =
  | 'set' | 'get' | 'list' | 'search_tags' | 'search_layer'
  | 'versions' | 'quick_set' | 'search_advanced' | 'set_batch'
  | 'has_updates' | 'set_from_template' | 'create_template'
  | 'list_templates' | 'hard_delete' | 'add_decision_context'
  | 'list_decision_contexts' | 'help' | 'example' | 'use_case';

/**
 * Task tool actions
 * Provides compile-time type checking for action parameters
 */
export type TaskAction =
  | 'create' | 'update' | 'get' | 'list' | 'move' | 'link'
  | 'archive' | 'batch_create' | 'add_dependency' | 'remove_dependency'
  | 'get_dependencies' | 'watch_files' | 'get_pruned_files' | 'link_pruned_file'
  | 'watcher'
  | 'help' | 'example' | 'use_case';

/**
 * File tool actions
 * Provides compile-time type checking for action parameters
 */
export type FileAction =
  | 'record' | 'get' | 'check_lock' | 'record_batch'
  | 'help' | 'example' | 'use_case';

/**
 * Constraint tool actions
 * Provides compile-time type checking for action parameters
 */
export type ConstraintAction =
  | 'add' | 'get' | 'deactivate'
  | 'help' | 'example' | 'use_case';

/**
 * Stats tool actions
 * Provides compile-time type checking for action parameters
 */
export type StatsAction =
  | 'layer_summary' | 'db_stats' | 'clear' | 'activity_log' | 'flush'
  | 'help_action' | 'help_params' | 'help_tool' | 'help_use_case'
  | 'help_list_use_cases' | 'help_next_actions'
  | 'help' | 'example' | 'use_case';

/**
 * Config tool actions
 * Provides compile-time type checking for action parameters
 */
export type ConfigAction =
  | 'get' | 'update'
  | 'help' | 'example' | 'use_case';

/**
 * Message tool actions
 * @deprecated Messaging system removed in v3.6.6. This type remains for backward compatibility.
 */
export type MessageAction =
  | 'send' | 'get' | 'mark_read' | 'send_batch'
  | 'help' | 'example' | 'use_case';
