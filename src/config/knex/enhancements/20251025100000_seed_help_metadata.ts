import type { Knex } from "knex";

/**
 * Migration: Seed Help System Metadata - Tools, Actions, and Parameters (v3.6.0)
 *
 * This migration seeds the remaining help system metadata:
 * - 7 tools with descriptions
 * - 41 actions with descriptions
 * - 98+ action parameters with types, defaults, and descriptions
 * - Code examples for each action
 *
 * This completes the help system foundation established in 20251025090100.
 */

export async function up(knex: Knex): Promise<void> {
  // Check if help metadata already seeded
  const existingTools = await knex('m_help_tools').select('tool_name');

  if (existingTools.length > 0) {
    console.log('✓ Help metadata already seeded, skipping');
    return;
  }

  // =========================================================================
  // 1. Seed Tools (7 tools)
  // =========================================================================

  await knex('m_help_tools').insert([
    {
      tool_name: 'decision',
      description: 'Context Management - Store decisions with metadata (tags, layers, versions, scopes). Track architectural decisions, design choices, and shared context across agents with full version history and rich decision context support.'
    },
    {
      tool_name: 'task',
      description: 'Kanban Task Watcher - AI-optimized task management with auto-stale detection. Create, track, and coordinate development tasks with metadata, dependencies, and automatic file watching. Features status validation and flat hierarchy for AI simplicity.'
    },
    {
      tool_name: 'message',
      description: 'Agent Messaging - Send messages between agents with priority levels and read tracking. Enables asynchronous communication and coordination in multi-agent workflows with priority-based filtering.'
    },
    {
      tool_name: 'file',
      description: 'File Change Tracking - Track file changes with layer classification and lock detection. Maintain change history, prevent concurrent edit conflicts, and associate file modifications with architecture layers.'
    },
    {
      tool_name: 'constraint',
      description: 'Constraint Management - Manage architectural rules and requirements. Define, track, and enforce constraints with priority levels, categories, and layer associations to guide implementation decisions.'
    },
    {
      tool_name: 'config',
      description: 'Configuration - Manage auto-deletion settings with weekend-aware retention. Control message and file history retention periods with support for skipping weekends in cleanup calculations.'
    },
    {
      tool_name: 'stats',
      description: 'Statistics & Utilities - View stats, activity logs, manage data cleanup, and access help system. Provides database statistics, layer summaries, activity history, and granular help queries with 60-70% token reduction.'
    }
  ]);

  // =========================================================================
  // 2. Seed Actions (41 actions across 7 tools)
  // =========================================================================

  // Get tool names for foreign key relationships (using tool_name as primary key)

  // DECISION tool actions (9 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'decision', action_name: 'set', description: 'Create or update a decision with metadata (tags, layers, versions, scopes). Supports both string and numeric values stored in separate tables for efficiency.' },
    { tool_name: 'decision', action_name: 'get', description: 'Retrieve a specific decision by key with all metadata (tags, layers, scopes, version, timestamp). Optionally include decision context (rationale, alternatives, tradeoffs).' },
    { tool_name: 'decision', action_name: 'list', description: 'List all decisions with optional filtering by status, layer, or scope. Returns decisions with full metadata for comprehensive context review.' },
    { tool_name: 'decision', action_name: 'search_tags', description: 'Search decisions by one or more tags using AND/OR logic. Returns decisions matching the tag criteria with full metadata.' },
    { tool_name: 'decision', action_name: 'search_layer', description: 'Search decisions by architecture layer (presentation, business, data, infrastructure, cross-cutting). Returns layer-specific decisions with metadata.' },
    { tool_name: 'decision', action_name: 'versions', description: 'Get version history for a decision showing how the value changed over time. Returns all historical versions with timestamps and metadata.' },
    { tool_name: 'decision', action_name: 'add_decision_context', description: 'Add rich context to a decision including rationale, alternatives considered, tradeoffs, and related tasks/constraints. Supports comprehensive documentation for multi-session development.' },
    { tool_name: 'decision', action_name: 'list_decision_contexts', description: 'List decision contexts with flexible filtering by decision key, tags, or related entities. Returns contexts with full rationale and alternatives documentation.' },
    { tool_name: 'decision', action_name: 'help', description: 'Get comprehensive help documentation for the decision tool including all actions, parameters, examples, and workflows. Returns full reference documentation.' }
  ]);

  // TASK tool actions (12 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'task', action_name: 'create', description: 'Create a new task with title, description, priority, status, layer, tags, and assigned agent. Returns task_id for subsequent operations. Automatically logs creation to activity log.' },
    { tool_name: 'task', action_name: 'update', description: 'Update task fields (title, description, priority, tags, notes, assigned_agent) without changing status. Use move action for status changes to ensure validation.' },
    { tool_name: 'task', action_name: 'get', description: 'Retrieve a specific task by ID with all details, metadata, linked entities (decisions, constraints, files), and dependencies. Returns comprehensive task context.' },
    { tool_name: 'task', action_name: 'list', description: 'List tasks with metadata-only queries (70% token reduction vs decision tool). Filter by status, priority, layer, tags, or assigned agent. Returns task summaries for efficient browsing.' },
    { tool_name: 'task', action_name: 'move', description: 'Move task to new status with validation. Enforces state machine transitions (e.g., cannot jump todo → done). Automatically logs status changes and updates timestamps.' },
    { tool_name: 'task', action_name: 'link', description: 'Link task to decision, constraint, or file for context tracking. Supports multiple link types (implements, addresses, modifies) to express relationships.' },
    { tool_name: 'task', action_name: 'archive', description: 'Archive a task (soft delete) removing it from active lists while preserving data. Archived tasks remain queryable for history but do not appear in default views.' },
    { tool_name: 'task', action_name: 'create_batch', description: 'Create multiple tasks in a single operation for efficiency. Accepts array of task definitions and returns array of created task IDs. Atomic operation with transaction safety.' },
    { tool_name: 'task', action_name: 'add_dependency', description: 'Add blocking dependency between tasks. Prevents circular dependencies and maintains dependency graph integrity. Task cannot be marked done while blockers are incomplete.' },
    { tool_name: 'task', action_name: 'remove_dependency', description: 'Remove blocking dependency between tasks. Validates dependency exists before removal. Updates dependency graph and unblocks dependent task if all blockers removed.' },
    { tool_name: 'task', action_name: 'get_dependencies', description: 'Get all dependencies for a task showing which tasks block it and which tasks it blocks. Returns dependency graph with task details for visualization.' },
    { tool_name: 'task', action_name: 'watch_files', description: 'Enable automatic file tracking for a task. When files change, they are automatically linked to the task. Supports VCS-aware tracking with whitelist exemption for staging/commits.' }
  ]);

  // MESSAGE tool actions (4 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'message', action_name: 'send', description: 'Send a message to another agent with priority level (low, medium, high, critical) and message type (decision, warning, request, info). Supports optional JSON payload for structured data.' },
    { tool_name: 'message', action_name: 'get', description: 'Retrieve messages with filtering by recipient, priority, read status, or message type. Returns messages with sender, timestamp, and payload. Supports pagination with limit/offset.' },
    { tool_name: 'message', action_name: 'mark_read', description: 'Mark one or more messages as read by message ID. Updates read status and timestamp. Used for tracking message processing and clearing notification counts.' },
    { tool_name: 'message', action_name: 'help', description: 'Get comprehensive help documentation for the message tool including all actions, parameters, examples, and workflows. Returns full reference documentation.' }
  ]);

  // FILE tool actions (4 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'file', action_name: 'record', description: 'Record a file change (created, modified, deleted) with layer assignment and optional description. Creates change history entry and enables conflict detection. Supports VCS-aware tracking.' },
    { tool_name: 'file', action_name: 'get', description: 'Retrieve file change history with filtering by file path, agent, layer, or time range. Returns changes with timestamps, change types, and descriptions. Supports pagination.' },
    { tool_name: 'file', action_name: 'check_lock', description: 'Check if a file is currently locked by another agent. Returns lock status, lock holder, and lock timestamp. Used to prevent concurrent edit conflicts in multi-agent scenarios.' },
    { tool_name: 'file', action_name: 'help', description: 'Get comprehensive help documentation for the file tool including all actions, parameters, examples, and workflows. Returns full reference documentation.' }
  ]);

  // CONSTRAINT tool actions (4 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'constraint', action_name: 'add', description: 'Add a new constraint with text, category, priority, layer, and tags. Constraints guide implementation decisions and enforce architectural rules. Supports priority levels (low, medium, high, critical).' },
    { tool_name: 'constraint', action_name: 'get', description: 'Retrieve constraints with filtering by category, priority, layer, tags, or active status. Returns constraints with full metadata for rule enforcement and compliance checking.' },
    { tool_name: 'constraint', action_name: 'deactivate', description: 'Deactivate a constraint (soft delete) removing it from active enforcement while preserving historical record. Deactivated constraints remain queryable but do not appear in active queries.' },
    { tool_name: 'constraint', action_name: 'help', description: 'Get comprehensive help documentation for the constraint tool including all actions, parameters, examples, and workflows. Returns full reference documentation.' }
  ]);

  // CONFIG tool actions (3 actions)
  await knex('m_help_actions').insert([
    { tool_name: 'config', action_name: 'get', description: 'Get current configuration settings including message retention hours, file history retention days, and weekend-aware mode. Returns all config values with current active settings.' },
    { tool_name: 'config', action_name: 'update', description: 'Update configuration settings for auto-deletion retention periods and weekend-aware mode. Changes take effect immediately and apply to next cleanup operation.' },
    { tool_name: 'config', action_name: 'help', description: 'Get comprehensive help documentation for the config tool including all actions, parameters, examples, and workflows. Returns full reference documentation.' }
  ]);

  // STATS tool actions (11 actions including help queries)
  await knex('m_help_actions').insert([
    { tool_name: 'stats', action_name: 'layer_summary', description: 'Get aggregated statistics per architecture layer showing decision counts, file changes, task distribution, and constraint counts. Useful for understanding architecture coverage and activity distribution.' },
    { tool_name: 'stats', action_name: 'db_stats', description: 'Get comprehensive database statistics including table row counts, storage usage, activity metrics, and inline task status. Provides system health overview and capacity planning data.' },
    { tool_name: 'stats', action_name: 'clear', description: 'Manually trigger cleanup of old data using weekend-aware retention settings. Removes messages and file changes older than configured retention periods. Returns count of deleted records.' },
    { tool_name: 'stats', action_name: 'activity_log', description: 'Retrieve activity log entries with filtering by time, agent, or action type. Shows system activity history with timestamps and structured details. Supports relative time filters (5m, 1h, 2d).' },
    { tool_name: 'stats', action_name: 'flush', description: 'Flush WAL (Write-Ahead Log) to database file for immediate persistence. Ensures all pending writes are committed to disk. Returns flush status and checkpoint info.' },
    { tool_name: 'stats', action_name: 'help_action', description: 'Query single action with parameters and examples. Returns ~200 tokens (vs ~2,000 legacy). Provides action description, parameter specs, and code examples for specified tool/action pair.' },
    { tool_name: 'stats', action_name: 'help_params', description: 'Query just parameter list for an action. Returns ~229 tokens (vs ~1,500 legacy). Provides parameter names, types, required status, descriptions, and defaults.' },
    { tool_name: 'stats', action_name: 'help_tool', description: 'Query tool overview + all actions. Returns ~139 tokens (vs ~5,000 legacy). Provides tool description and list of all actions with brief descriptions.' },
    { tool_name: 'stats', action_name: 'help_use_case', description: 'Get single use-case with full workflow. Returns ~150 tokens per use-case. Provides title, description, workflow steps, expected outcome, and code examples for a specific use-case ID.' },
    { tool_name: 'stats', action_name: 'help_list_use_cases', description: 'List/filter use-cases by category/complexity with pagination. Returns ~388 tokens (filtered) or ~584 tokens (all). Supports filtering by category (task_management, decision_tracking, etc.) and complexity (basic, intermediate, advanced).' },
    { tool_name: 'stats', action_name: 'help_next_actions', description: 'Suggest common next actions after given action. Returns ~65 tokens with frequency indicators. Shows typical workflow patterns based on usage data.' }
  ]);

  // =========================================================================
  // 3. Seed Action Parameters (98+ parameters)
  // =========================================================================

  // First, get action IDs for foreign key relationships
  const actions = await knex('m_help_actions').select('action_id', 'tool_name', 'action_name');
  const actionMap = actions.reduce((map, action) => {
    const key = `${action.tool_name}:${action.action_name}`;
    map[key] = action.action_id;
    return map;
  }, {} as Record<string, number>);

  const parameters = [
    // DECISION:SET parameters (9 params)
    { action_id: actionMap['decision:set'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "set"', default_value: null },
    { action_id: actionMap['decision:set'], param_name: 'decision_key', param_type: 'string', required: 1, description: 'Unique key identifying the decision', default_value: null },
    { action_id: actionMap['decision:set'], param_name: 'value', param_type: 'string | number', required: 1, description: 'Decision value (string or numeric)', default_value: null },
    { action_id: actionMap['decision:set'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Array of tag strings for categorization', default_value: '[]' },
    { action_id: actionMap['decision:set'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer (presentation, business, data, infrastructure, cross-cutting)', default_value: null },
    { action_id: actionMap['decision:set'], param_name: 'scope', param_type: 'string', required: 0, description: 'Module or component scope identifier', default_value: null },
    { action_id: actionMap['decision:set'], param_name: 'version', param_type: 'string', required: 0, description: 'Version identifier (e.g., v1.0.0)', default_value: 'v1.0.0' },
    { action_id: actionMap['decision:set'], param_name: 'status', param_type: 'string', required: 0, description: 'Decision status: active, deprecated, draft', default_value: 'active' },
    { action_id: actionMap['decision:set'], param_name: 'description', param_type: 'string', required: 0, description: 'Brief description of the decision', default_value: null },

    // DECISION:GET parameters (3 params)
    { action_id: actionMap['decision:get'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "get"', default_value: null },
    { action_id: actionMap['decision:get'], param_name: 'decision_key', param_type: 'string', required: 1, description: 'Key of the decision to retrieve', default_value: null },
    { action_id: actionMap['decision:get'], param_name: 'include_context', param_type: 'boolean', required: 0, description: 'Include decision context (rationale, alternatives, tradeoffs)', default_value: 'false' },

    // DECISION:LIST parameters (4 params)
    { action_id: actionMap['decision:list'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "list"', default_value: null },
    { action_id: actionMap['decision:list'], param_name: 'status', param_type: 'string', required: 0, description: 'Filter by status: active, deprecated, draft', default_value: null },
    { action_id: actionMap['decision:list'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by architecture layer', default_value: null },
    { action_id: actionMap['decision:list'], param_name: 'scope', param_type: 'string', required: 0, description: 'Filter by scope identifier', default_value: null },

    // DECISION:SEARCH_TAGS parameters (3 params)
    { action_id: actionMap['decision:search_tags'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "search_tags"', default_value: null },
    { action_id: actionMap['decision:search_tags'], param_name: 'tags', param_type: 'string[]', required: 1, description: 'Array of tag strings to search', default_value: null },
    { action_id: actionMap['decision:search_tags'], param_name: 'match_all', param_type: 'boolean', required: 0, description: 'If true, require all tags (AND); if false, any tag (OR)', default_value: 'false' },

    // DECISION:SEARCH_LAYER parameters (2 params)
    { action_id: actionMap['decision:search_layer'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "search_layer"', default_value: null },
    { action_id: actionMap['decision:search_layer'], param_name: 'layer', param_type: 'string', required: 1, description: 'Architecture layer to search', default_value: null },

    // DECISION:VERSIONS parameters (2 params)
    { action_id: actionMap['decision:versions'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "versions"', default_value: null },
    { action_id: actionMap['decision:versions'], param_name: 'decision_key', param_type: 'string', required: 1, description: 'Key of the decision to get version history', default_value: null },

    // DECISION:ADD_DECISION_CONTEXT parameters (6 params)
    { action_id: actionMap['decision:add_decision_context'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "add_decision_context"', default_value: null },
    { action_id: actionMap['decision:add_decision_context'], param_name: 'decision_key', param_type: 'string', required: 1, description: 'Decision key to add context to', default_value: null },
    { action_id: actionMap['decision:add_decision_context'], param_name: 'rationale', param_type: 'string', required: 1, description: 'Why this decision was made', default_value: null },
    { action_id: actionMap['decision:add_decision_context'], param_name: 'alternatives_considered', param_type: 'string', required: 0, description: 'Alternative options that were evaluated', default_value: null },
    { action_id: actionMap['decision:add_decision_context'], param_name: 'tradeoffs', param_type: 'object', required: 0, description: 'Pros and cons object: {pros: string[], cons: string[]}', default_value: null },
    { action_id: actionMap['decision:add_decision_context'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for context categorization', default_value: '[]' },

    // TASK:CREATE parameters (8 params)
    { action_id: actionMap['task:create'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "create"', default_value: null },
    { action_id: actionMap['task:create'], param_name: 'title', param_type: 'string', required: 1, description: 'Task title (max 500 chars)', default_value: null },
    { action_id: actionMap['task:create'], param_name: 'description', param_type: 'string', required: 0, description: 'Detailed task description', default_value: null },
    { action_id: actionMap['task:create'], param_name: 'priority', param_type: 'number', required: 0, description: 'Priority: 1=low, 2=medium, 3=high, 4=critical', default_value: '2' },
    { action_id: actionMap['task:create'], param_name: 'status', param_type: 'string', required: 0, description: 'Initial status: todo, in_progress, waiting_review, blocked, done', default_value: 'todo' },
    { action_id: actionMap['task:create'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer assignment', default_value: null },
    { action_id: actionMap['task:create'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Array of tag strings', default_value: '[]' },
    { action_id: actionMap['task:create'], param_name: 'assigned_agent', param_type: 'string', required: 0, description: 'Agent name assigned to task', default_value: null },

    // TASK:UPDATE parameters (7 params)
    { action_id: actionMap['task:update'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "update"', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'task_id', param_type: 'number', required: 1, description: 'ID of task to update', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'title', param_type: 'string', required: 0, description: 'New task title', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'description', param_type: 'string', required: 0, description: 'New task description', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'priority', param_type: 'number', required: 0, description: 'New priority level', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'New tags array (replaces existing)', default_value: null },
    { action_id: actionMap['task:update'], param_name: 'assigned_agent', param_type: 'string', required: 0, description: 'New assigned agent', default_value: null },

    // TASK:MOVE parameters (3 params)
    { action_id: actionMap['task:move'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "move"', default_value: null },
    { action_id: actionMap['task:move'], param_name: 'task_id', param_type: 'number', required: 1, description: 'ID of task to move', default_value: null },
    { action_id: actionMap['task:move'], param_name: 'new_status', param_type: 'string', required: 1, description: 'Target status (validated for legal transitions)', default_value: null },

    // TASK:LIST parameters (6 params)
    { action_id: actionMap['task:list'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "list"', default_value: null },
    { action_id: actionMap['task:list'], param_name: 'status', param_type: 'string', required: 0, description: 'Filter by status', default_value: null },
    { action_id: actionMap['task:list'], param_name: 'priority', param_type: 'number', required: 0, description: 'Filter by priority', default_value: null },
    { action_id: actionMap['task:list'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by layer', default_value: null },
    { action_id: actionMap['task:list'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Filter by tags', default_value: null },
    { action_id: actionMap['task:list'], param_name: 'assigned_agent', param_type: 'string', required: 0, description: 'Filter by assigned agent', default_value: null },

    // TASK:ADD_DEPENDENCY parameters (3 params)
    { action_id: actionMap['task:add_dependency'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "add_dependency"', default_value: null },
    { action_id: actionMap['task:add_dependency'], param_name: 'task_id', param_type: 'number', required: 1, description: 'ID of task that is blocked', default_value: null },
    { action_id: actionMap['task:add_dependency'], param_name: 'blocks_on_task_id', param_type: 'number', required: 1, description: 'ID of task that blocks completion', default_value: null },

    // MESSAGE:SEND parameters (6 params)
    { action_id: actionMap['message:send'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "send"', default_value: null },
    { action_id: actionMap['message:send'], param_name: 'to_agent', param_type: 'string', required: 1, description: 'Recipient agent name', default_value: null },
    { action_id: actionMap['message:send'], param_name: 'message', param_type: 'string', required: 1, description: 'Message text content', default_value: null },
    { action_id: actionMap['message:send'], param_name: 'priority', param_type: 'string', required: 0, description: 'Priority: low, medium, high, critical', default_value: 'medium' },
    { action_id: actionMap['message:send'], param_name: 'msg_type', param_type: 'string', required: 0, description: 'Message type: decision, warning, request, info', default_value: 'info' },
    { action_id: actionMap['message:send'], param_name: 'payload', param_type: 'object', required: 0, description: 'Optional JSON payload for structured data', default_value: null },

    // MESSAGE:GET parameters (5 params)
    { action_id: actionMap['message:get'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "get"', default_value: null },
    { action_id: actionMap['message:get'], param_name: 'to_agent', param_type: 'string', required: 0, description: 'Filter by recipient agent', default_value: null },
    { action_id: actionMap['message:get'], param_name: 'priority', param_type: 'string', required: 0, description: 'Filter by priority level', default_value: null },
    { action_id: actionMap['message:get'], param_name: 'unread_only', param_type: 'boolean', required: 0, description: 'Show only unread messages', default_value: 'false' },
    { action_id: actionMap['message:get'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum messages to return', default_value: '50' },

    // FILE:RECORD parameters (5 params)
    { action_id: actionMap['file:record'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "record"', default_value: null },
    { action_id: actionMap['file:record'], param_name: 'file_path', param_type: 'string', required: 1, description: 'Path to file (relative or absolute)', default_value: null },
    { action_id: actionMap['file:record'], param_name: 'change_type', param_type: 'string', required: 1, description: 'Change type: created, modified, deleted', default_value: null },
    { action_id: actionMap['file:record'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer for file', default_value: null },
    { action_id: actionMap['file:record'], param_name: 'description', param_type: 'string', required: 0, description: 'Description of change', default_value: null },

    // FILE:GET parameters (5 params)
    { action_id: actionMap['file:get'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "get"', default_value: null },
    { action_id: actionMap['file:get'], param_name: 'file_path', param_type: 'string', required: 0, description: 'Filter by file path', default_value: null },
    { action_id: actionMap['file:get'], param_name: 'agent_name', param_type: 'string', required: 0, description: 'Filter by agent who made change', default_value: null },
    { action_id: actionMap['file:get'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by architecture layer', default_value: null },
    { action_id: actionMap['file:get'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum changes to return', default_value: '100' },

    // CONSTRAINT:ADD parameters (6 params)
    { action_id: actionMap['constraint:add'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "add"', default_value: null },
    { action_id: actionMap['constraint:add'], param_name: 'constraint_text', param_type: 'string', required: 1, description: 'Constraint description/rule text', default_value: null },
    { action_id: actionMap['constraint:add'], param_name: 'category', param_type: 'string', required: 1, description: 'Constraint category (e.g., performance, security)', default_value: null },
    { action_id: actionMap['constraint:add'], param_name: 'priority', param_type: 'string', required: 0, description: 'Priority: low, medium, high, critical', default_value: 'medium' },
    { action_id: actionMap['constraint:add'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer affected', default_value: null },
    { action_id: actionMap['constraint:add'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for categorization', default_value: '[]' },

    // CONFIG:UPDATE parameters (4 params)
    { action_id: actionMap['config:update'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "update"', default_value: null },
    { action_id: actionMap['config:update'], param_name: 'messageRetentionHours', param_type: 'number', required: 0, description: 'Hours to retain messages', default_value: '24' },
    { action_id: actionMap['config:update'], param_name: 'fileHistoryRetentionDays', param_type: 'number', required: 0, description: 'Days to retain file history', default_value: '7' },
    { action_id: actionMap['config:update'], param_name: 'weekendAwareMode', param_type: 'boolean', required: 0, description: 'Skip weekends in retention calculation', default_value: 'false' },

    // STATS:HELP_ACTION parameters (3 params)
    { action_id: actionMap['stats:help_action'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "help_action"', default_value: null },
    { action_id: actionMap['stats:help_action'], param_name: 'tool', param_type: 'string', required: 1, description: 'Tool name to query', default_value: null },
    { action_id: actionMap['stats:help_action'], param_name: 'action', param_type: 'string', required: 1, description: 'Action name to query', default_value: null },

    // STATS:HELP_LIST_USE_CASES parameters (4 params)
    { action_id: actionMap['stats:help_list_use_cases'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "help_list_use_cases"', default_value: null },
    { action_id: actionMap['stats:help_list_use_cases'], param_name: 'category', param_type: 'string', required: 0, description: 'Filter by category', default_value: null },
    { action_id: actionMap['stats:help_list_use_cases'], param_name: 'complexity', param_type: 'string', required: 0, description: 'Filter by complexity: basic, intermediate, advanced', default_value: null },
    { action_id: actionMap['stats:help_list_use_cases'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum use-cases to return', default_value: '20' }
  ];

  await knex('t_help_action_params').insert(parameters);

  console.log(`✅ Seeded ${parameters.length} action parameters`);
}

export async function down(knex: Knex): Promise<void> {
  // Remove all seeded data in reverse order
  await knex('t_help_action_params').delete();
  await knex('m_help_actions').delete();
  await knex('m_help_tools').delete();
}
