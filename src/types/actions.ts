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
  | 'archive' | 'create_batch' | 'add_dependency' | 'remove_dependency'
  | 'get_dependencies' | 'watch_files' | 'get_pruned_files' | 'link_pruned_file'
  | 'watcher'
  | 'help' | 'example' | 'use_case';

/**
 * File tool actions
 * Provides compile-time type checking for action parameters
 */
export type FileAction =
  | 'record' | 'get' | 'check_lock' | 'record_batch'
  | 'sqlite_flush'
  | 'help' | 'example' | 'use_case';

/**
 * Constraint tool actions
 * Provides compile-time type checking for action parameters
 */
export type ConstraintAction =
  | 'add' | 'get' | 'deactivate' | 'suggest_pending'
  | 'help' | 'example' | 'use_case';

/**
 * Suggest tool actions (v3.9.0)
 * Provides compile-time type checking for suggestion actions
 */
export type SuggestAction =
  | 'by_key' | 'by_tags' | 'by_context' | 'check_duplicate'
  | 'help';

/**
 * Example tool actions
 * Provides compile-time type checking for example actions
 */
export type ExampleAction =
  | 'get' | 'search' | 'list_all'
  | 'help' | 'example';

/**
 * Stats tool actions
 * @deprecated Stats tool removed in v3.8.0. Stats functionality migrated to file tool (sqlite_flush).
 * This type is kept only for backward compatibility with existing code references.
 */
export type StatsAction = never;

/**
 * Message tool actions
 * @deprecated Messaging system removed in v3.8.0. Message tool has been completely removed.
 * This type is kept only for backward compatibility with existing code references.
 */
export type MessageAction = never;
