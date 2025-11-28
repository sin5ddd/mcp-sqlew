/**
 * v4 Help System Seed Data Migration
 *
 * Seeds help system tables with initial data:
 * - v4_help_tools (8 tools)
 * - v4_help_actions (68 actions)
 * - v4_help_use_case_cats (6 categories)
 * - v4_builtin_policies (5 policies)
 * - v4_help_action_params (60+ parameters)
 * - v4_help_use_cases (10 use cases)
 *
 * Separated from bootstrap for maintainability.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🌱 Seeding help system data...');

  // 1. Seed v4_help_tools (8 tools)
  const existingTools = await knex('v4_help_tools').count('* as count').first();
  if (!existingTools || Number(existingTools.count) === 0) {
    await knex('v4_help_tools').insert([
      {
        tool_name: 'decision',
        description: 'Context Management - Store decisions with metadata (tags, layers, versions, scopes). Track architectural decisions, design choices, and shared context with full version history and rich decision context support.'
      },
      {
        tool_name: 'task',
        description: 'Task Management - Create, track, and manage tasks with kanban workflow, layers, and file tracking. Supports batch operations, dependencies, file watching, and automatic stale detection.'
      },
      {
        tool_name: 'file',
        description: 'File Change Tracking - Track file modifications and database operations (SQLite only). Supports file change recording, history retrieval, lock detection, and batch operations.'
      },
      {
        tool_name: 'constraint',
        description: 'Architectural Rules - Define and manage project constraints with priorities. Supports categories, layer associations, and tag filtering.'
      },
      {
        tool_name: 'suggest',
        description: 'Intelligent Decision/Constraint Suggestion System - Find related decisions by key pattern, tags, or full context. Prevents duplicates and ensures consistency with hybrid scoring.'
      },
      {
        tool_name: 'help',
        description: 'Help System - Query action documentation, parameters, and workflow guidance. Returns only requested information (80-95% token reduction vs legacy help).'
      },
      {
        tool_name: 'example',
        description: 'Example System - Browse and search code examples for sqlew tools. Returns working code snippets with explanations (token-efficient).'
      },
      {
        tool_name: 'use_case',
        description: 'Use Case Catalog - Browse and search complete workflow scenarios. Returns end-to-end workflows with executable code examples.'
      }
    ]);
    console.log('  ✓ Help tools seeded (8)');
  }

  // 2. Seed v4_help_actions (68 actions)
  const existingActions = await knex('v4_help_actions').count('* as count').first();
  if (!existingActions || Number(existingActions.count) === 0) {
    await knex('v4_help_actions').insert([
      // DECISION TOOL ACTIONS (23)
      { tool_name: 'decision', action_name: 'set', description: 'Create or update a decision with full metadata support' },
      { tool_name: 'decision', action_name: 'get', description: 'Retrieve a specific decision by key' },
      { tool_name: 'decision', action_name: 'list', description: 'List decisions with filtering options' },
      { tool_name: 'decision', action_name: 'search_tags', description: 'Search decisions by tags (AND/OR logic)' },
      { tool_name: 'decision', action_name: 'search_layer', description: 'Search decisions by architecture layer' },
      { tool_name: 'decision', action_name: 'versions', description: 'Get version history for a decision' },
      { tool_name: 'decision', action_name: 'quick_set', description: 'Simplified decision setter with auto-inferred layer' },
      { tool_name: 'decision', action_name: 'search_advanced', description: 'Advanced search with multiple criteria' },
      { tool_name: 'decision', action_name: 'set_batch', description: 'Batch set multiple decisions atomically' },
      { tool_name: 'decision', action_name: 'has_updates', description: 'Check for new/updated decisions since timestamp' },
      { tool_name: 'decision', action_name: 'set_from_template', description: 'Create decision from predefined template' },
      { tool_name: 'decision', action_name: 'create_template', description: 'Create reusable decision template' },
      { tool_name: 'decision', action_name: 'list_templates', description: 'List all available decision templates' },
      { tool_name: 'decision', action_name: 'hard_delete', description: 'Permanently delete decision (irreversible)' },
      { tool_name: 'decision', action_name: 'add_decision_context', description: 'Add rich context (rationale, alternatives, tradeoffs)' },
      { tool_name: 'decision', action_name: 'list_decision_contexts', description: 'List decision contexts with filtering' },
      { tool_name: 'decision', action_name: 'analytics', description: 'Get decision analytics and statistics' },
      { tool_name: 'decision', action_name: 'create_policy', description: 'Create reusable decision policy with validation' },
      { tool_name: 'decision', action_name: 'list_policies', description: 'List all available decision policies' },
      { tool_name: 'decision', action_name: 'set_from_policy', description: 'Create decision from policy template' },
      { tool_name: 'decision', action_name: 'help', description: 'Get decision tool documentation' },
      { tool_name: 'decision', action_name: 'example', description: 'Get decision tool examples' },
      { tool_name: 'decision', action_name: 'use_case', description: 'Get decision tool use cases' },
      // TASK TOOL ACTIONS (16)
      { tool_name: 'task', action_name: 'create', description: 'Create a new task with metadata' },
      { tool_name: 'task', action_name: 'update', description: 'Update task fields' },
      { tool_name: 'task', action_name: 'get', description: 'Retrieve a specific task by ID' },
      { tool_name: 'task', action_name: 'list', description: 'List tasks with filtering options' },
      { tool_name: 'task', action_name: 'move', description: 'Move task to new status with validation' },
      { tool_name: 'task', action_name: 'link', description: 'Link task to decision/constraint/file' },
      { tool_name: 'task', action_name: 'archive', description: 'Archive a completed task' },
      { tool_name: 'task', action_name: 'create_batch', description: 'Batch create multiple tasks atomically' },
      { tool_name: 'task', action_name: 'add_dependency', description: 'Add blocking dependency between tasks' },
      { tool_name: 'task', action_name: 'remove_dependency', description: 'Remove existing task dependency' },
      { tool_name: 'task', action_name: 'get_dependencies', description: 'Get all dependencies for a task' },
      { tool_name: 'task', action_name: 'watch_files', description: 'Associate files with task for tracking' },
      { tool_name: 'task', action_name: 'watcher', description: 'Get file watcher status' },
      { tool_name: 'task', action_name: 'help', description: 'Get task tool documentation' },
      { tool_name: 'task', action_name: 'example', description: 'Get task tool examples' },
      { tool_name: 'task', action_name: 'use_case', description: 'Get task tool use cases' },
      // FILE TOOL ACTIONS (8)
      { tool_name: 'file', action_name: 'record', description: 'Record a file change with layer assignment' },
      { tool_name: 'file', action_name: 'get', description: 'Retrieve file change history' },
      { tool_name: 'file', action_name: 'check_lock', description: 'Check if file is locked by another process' },
      { tool_name: 'file', action_name: 'record_batch', description: 'Record multiple file changes atomically' },
      { tool_name: 'file', action_name: 'sqlite_flush', description: 'Flush WAL to database file (SQLite-specific)' },
      { tool_name: 'file', action_name: 'help', description: 'Get file tool documentation' },
      { tool_name: 'file', action_name: 'example', description: 'Get file tool examples' },
      { tool_name: 'file', action_name: 'use_case', description: 'Get file tool use cases' },
      // CONSTRAINT TOOL ACTIONS (6)
      { tool_name: 'constraint', action_name: 'add', description: 'Add a new constraint with priority' },
      { tool_name: 'constraint', action_name: 'get', description: 'Retrieve constraints with filtering' },
      { tool_name: 'constraint', action_name: 'deactivate', description: 'Deactivate a constraint (soft delete)' },
      { tool_name: 'constraint', action_name: 'help', description: 'Get constraint tool documentation' },
      { tool_name: 'constraint', action_name: 'example', description: 'Get constraint tool examples' },
      { tool_name: 'constraint', action_name: 'use_case', description: 'Get constraint tool use cases' },
      // SUGGEST TOOL ACTIONS (5)
      { tool_name: 'suggest', action_name: 'by_key', description: 'Find similar decisions by key pattern matching' },
      { tool_name: 'suggest', action_name: 'by_tags', description: 'Find decisions by tag overlap' },
      { tool_name: 'suggest', action_name: 'by_context', description: 'Hybrid scoring combining key, tags, layer, priority' },
      { tool_name: 'suggest', action_name: 'check_duplicate', description: 'Check if decision key already exists or is similar' },
      { tool_name: 'suggest', action_name: 'help', description: 'Get suggest tool documentation' },
      // HELP TOOL ACTIONS (8)
      { tool_name: 'help', action_name: 'query_action', description: 'Get documentation for a specific action' },
      { tool_name: 'help', action_name: 'query_params', description: 'Get parameter list for an action (quick reference)' },
      { tool_name: 'help', action_name: 'query_tool', description: 'Get tool overview and all actions' },
      { tool_name: 'help', action_name: 'workflow_hints', description: 'Get common next actions after current action' },
      { tool_name: 'help', action_name: 'batch_guide', description: 'Get guidance for batch operations' },
      { tool_name: 'help', action_name: 'error_recovery', description: 'Analyze errors and suggest fixes' },
      { tool_name: 'help', action_name: 'help', description: 'Get help system documentation' },
      { tool_name: 'help', action_name: 'example', description: 'Get help system examples' },
      // EXAMPLE TOOL ACTIONS (4)
      { tool_name: 'example', action_name: 'get', description: 'Get examples by tool, action, or topic' },
      { tool_name: 'example', action_name: 'search', description: 'Search examples by keyword' },
      { tool_name: 'example', action_name: 'list_all', description: 'List all available examples with filtering' },
      { tool_name: 'example', action_name: 'help', description: 'Get example system documentation' },
      // USE_CASE TOOL ACTIONS (4)
      { tool_name: 'use_case', action_name: 'get', description: 'Get complete use case workflow by ID' },
      { tool_name: 'use_case', action_name: 'search', description: 'Search use cases by keyword/category' },
      { tool_name: 'use_case', action_name: 'list_all', description: 'List all use cases with filtering' },
      { tool_name: 'use_case', action_name: 'help', description: 'Get use case catalog documentation' }
    ]);
    console.log('  ✓ Help actions seeded (68)');
  }

  // 3. Seed v4_help_use_case_cats (6 categories) - upsert to ensure data exists
  const categoryData = [
    { category_name: 'task_management', description: 'Use cases for creating, organizing, tracking, and coordinating development tasks through the Kanban-style task system.' },
    { category_name: 'decision_tracking', description: 'Use cases for recording, retrieving, and versioning architectural decisions, design choices, and shared context.' },
    { category_name: 'file_tracking', description: 'Use cases for tracking file modifications, detecting conflicts, and maintaining change history with layer associations.' },
    { category_name: 'constraint_management', description: 'Use cases for defining, enforcing, and tracking architectural constraints and requirements.' },
    { category_name: 'cross_tool_workflow', description: 'Use cases demonstrating multi-step workflows spanning multiple tools for complex scenarios.' },
    { category_name: 'decision_intelligence', description: 'Use cases for intelligent decision suggestions, duplicate detection, and policy-based automation.' }
  ];
  // Use ignore instead of merge to avoid id field issues across all databases
  for (const cat of categoryData) {
    const exists = await knex('v4_help_use_case_cats')
      .where('category_name', cat.category_name)
      .first();
    if (!exists) {
      await knex('v4_help_use_case_cats').insert(cat);
    }
  }
  console.log('  ✓ Help use case categories seeded (6)');

  // 4. Seed v4_builtin_policies (5 policies)
  const existingPolicies = await knex('v4_builtin_policies').count('* as count').first();
  if (!existingPolicies || Number(existingPolicies.count) === 0) {
    await knex('v4_builtin_policies').insert([
      {
        name: 'security_vulnerability',
        defaults: JSON.stringify({ layer: 'cross-cutting', status: 'active', tags: ['security', 'vulnerability'], priority: 4 }),
        validation_rules: JSON.stringify({ patterns: { key: '^CVE-\\d{4}-\\d{4,7}$' } }),
        quality_gates: JSON.stringify({ required_fields: ['rationale'] }),
        suggest_similar: 1,
        category: 'security'
      },
      {
        name: 'breaking_change',
        defaults: JSON.stringify({ layer: 'infrastructure', status: 'active', tags: ['breaking-change', 'versioning'], priority: 4 }),
        validation_rules: JSON.stringify({ patterns: { value: '.*migration.*|.*upgrade.*' } }),
        quality_gates: JSON.stringify({ required_fields: ['rationale', 'alternatives'] }),
        suggest_similar: 1,
        category: 'versioning'
      },
      {
        name: 'architecture_decision',
        defaults: JSON.stringify({ layer: 'infrastructure', status: 'active', tags: ['architecture', 'adr'], priority: 3 }),
        validation_rules: null,
        quality_gates: JSON.stringify({ required_fields: ['rationale', 'alternatives', 'tradeoffs'] }),
        suggest_similar: 1,
        category: 'architecture'
      },
      {
        name: 'performance_optimization',
        defaults: JSON.stringify({ layer: 'infrastructure', status: 'active', tags: ['performance', 'optimization'], priority: 2 }),
        validation_rules: null,
        quality_gates: JSON.stringify({ required_fields: ['rationale'] }),
        suggest_similar: 1,
        category: 'performance'
      },
      {
        name: 'deprecation',
        defaults: JSON.stringify({ layer: 'infrastructure', status: 'active', tags: ['deprecation', 'migration'], priority: 3 }),
        validation_rules: JSON.stringify({ patterns: { value: '.*replace.*|.*alternative.*|.*migration.*' } }),
        quality_gates: JSON.stringify({ required_fields: ['rationale', 'alternatives'] }),
        suggest_similar: 1,
        category: 'deprecation'
      }
    ]);
    console.log('  ✓ Built-in policies seeded (5)');
  }

  // 5. Seed v4_help_action_params
  const existingParams = await knex('v4_help_action_params').count('* as count').first();
  if (!existingParams || Number(existingParams.count) === 0) {
    const actions = await knex('v4_help_actions').select('id', 'tool_name', 'action_name');
    const actionMap = actions.reduce((map: Record<string, number>, action: { id: number; tool_name: string; action_name: string }) => {
      map[`${action.tool_name}:${action.action_name}`] = action.id;
      return map;
    }, {} as Record<string, number>);

    if (Object.keys(actionMap).length > 0) {
      const params = [
        // DECISION:SET
        { action_id: actionMap['decision:set'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "set"', default_value: null },
        { action_id: actionMap['decision:set'], param_name: 'key', param_type: 'string', required: 1, description: 'Unique decision key', default_value: null },
        { action_id: actionMap['decision:set'], param_name: 'value', param_type: 'string | number', required: 1, description: 'Decision value', default_value: null },
        { action_id: actionMap['decision:set'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for categorization', default_value: '[]' },
        { action_id: actionMap['decision:set'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer', default_value: null },
        { action_id: actionMap['decision:set'], param_name: 'scope', param_type: 'string', required: 0, description: 'Module or component scope', default_value: null },
        { action_id: actionMap['decision:set'], param_name: 'version', param_type: 'string', required: 0, description: 'Version identifier', default_value: 'v1.0.0' },
        { action_id: actionMap['decision:set'], param_name: 'status', param_type: 'string', required: 0, description: 'Decision status: active, deprecated, draft', default_value: 'active' },
        // DECISION:GET
        { action_id: actionMap['decision:get'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "get"', default_value: null },
        { action_id: actionMap['decision:get'], param_name: 'key', param_type: 'string', required: 1, description: 'Decision key to retrieve', default_value: null },
        { action_id: actionMap['decision:get'], param_name: 'include_context', param_type: 'boolean', required: 0, description: 'Include rationale/alternatives/tradeoffs', default_value: 'false' },
        // DECISION:LIST
        { action_id: actionMap['decision:list'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "list"', default_value: null },
        { action_id: actionMap['decision:list'], param_name: 'status', param_type: 'string', required: 0, description: 'Filter by status', default_value: null },
        { action_id: actionMap['decision:list'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by layer', default_value: null },
        { action_id: actionMap['decision:list'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum results', default_value: '50' },
        // TASK:CREATE
        { action_id: actionMap['task:create'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "create"', default_value: null },
        { action_id: actionMap['task:create'], param_name: 'title', param_type: 'string', required: 1, description: 'Task title (max 500 chars)', default_value: null },
        { action_id: actionMap['task:create'], param_name: 'description', param_type: 'string', required: 0, description: 'Detailed task description', default_value: null },
        { action_id: actionMap['task:create'], param_name: 'priority', param_type: 'number', required: 0, description: 'Priority: 1=low, 2=medium, 3=high, 4=critical', default_value: '2' },
        { action_id: actionMap['task:create'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer', default_value: null },
        { action_id: actionMap['task:create'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for categorization', default_value: '[]' },
        { action_id: actionMap['task:create'], param_name: 'file_actions', param_type: 'object[]', required: 0, description: 'Files to track: [{path, action}]', default_value: null },
        // TASK:MOVE
        { action_id: actionMap['task:move'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "move"', default_value: null },
        { action_id: actionMap['task:move'], param_name: 'task_id', param_type: 'number', required: 1, description: 'Task ID to move', default_value: null },
        { action_id: actionMap['task:move'], param_name: 'status', param_type: 'string', required: 1, description: 'Target status', default_value: null },
        { action_id: actionMap['task:move'], param_name: 'rejection_reason', param_type: 'string', required: 0, description: 'Reason for rejection (when moving to rejected)', default_value: null },
        // TASK:LIST
        { action_id: actionMap['task:list'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "list"', default_value: null },
        { action_id: actionMap['task:list'], param_name: 'status', param_type: 'string', required: 0, description: 'Filter by status', default_value: null },
        { action_id: actionMap['task:list'], param_name: 'priority', param_type: 'number', required: 0, description: 'Filter by priority', default_value: null },
        { action_id: actionMap['task:list'], param_name: 'layer', param_type: 'string', required: 0, description: 'Filter by layer', default_value: null },
        { action_id: actionMap['task:list'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Filter by tags', default_value: null },
        { action_id: actionMap['task:list'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum results', default_value: '50' },
        // TASK:ADD_DEPENDENCY
        { action_id: actionMap['task:add_dependency'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "add_dependency"', default_value: null },
        { action_id: actionMap['task:add_dependency'], param_name: 'blocker_task_id', param_type: 'number', required: 1, description: 'Task ID that blocks', default_value: null },
        { action_id: actionMap['task:add_dependency'], param_name: 'blocked_task_id', param_type: 'number', required: 1, description: 'Task ID that is blocked', default_value: null },
        // FILE:RECORD
        { action_id: actionMap['file:record'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "record"', default_value: null },
        { action_id: actionMap['file:record'], param_name: 'file_path', param_type: 'string', required: 1, description: 'Path to file', default_value: null },
        { action_id: actionMap['file:record'], param_name: 'change_type', param_type: 'string', required: 1, description: 'Change type: created, modified, deleted', default_value: null },
        { action_id: actionMap['file:record'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer', default_value: null },
        // CONSTRAINT:ADD
        { action_id: actionMap['constraint:add'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "add"', default_value: null },
        { action_id: actionMap['constraint:add'], param_name: 'constraint_text', param_type: 'string', required: 1, description: 'Constraint rule text', default_value: null },
        { action_id: actionMap['constraint:add'], param_name: 'category', param_type: 'string', required: 1, description: 'Constraint category', default_value: null },
        { action_id: actionMap['constraint:add'], param_name: 'priority', param_type: 'number', required: 0, description: 'Priority: 1-4', default_value: '2' },
        { action_id: actionMap['constraint:add'], param_name: 'layer', param_type: 'string', required: 0, description: 'Architecture layer', default_value: null },
        // SUGGEST:BY_CONTEXT
        { action_id: actionMap['suggest:by_context'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "by_context"', default_value: null },
        { action_id: actionMap['suggest:by_context'], param_name: 'key', param_type: 'string', required: 1, description: 'Decision key pattern', default_value: null },
        { action_id: actionMap['suggest:by_context'], param_name: 'tags', param_type: 'string[]', required: 0, description: 'Tags for matching', default_value: '[]' },
        { action_id: actionMap['suggest:by_context'], param_name: 'layer', param_type: 'string', required: 0, description: 'Layer filter', default_value: null },
        { action_id: actionMap['suggest:by_context'], param_name: 'limit', param_type: 'number', required: 0, description: 'Max suggestions', default_value: '5' },
        { action_id: actionMap['suggest:by_context'], param_name: 'min_score', param_type: 'number', required: 0, description: 'Minimum relevance score', default_value: '30' },
        // HELP:QUERY_ACTION
        { action_id: actionMap['help:query_action'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "query_action"', default_value: null },
        { action_id: actionMap['help:query_action'], param_name: 'tool', param_type: 'string', required: 1, description: 'Tool name', default_value: null },
        { action_id: actionMap['help:query_action'], param_name: 'target_action', param_type: 'string', required: 1, description: 'Action to query', default_value: null },
        // EXAMPLE:GET
        { action_id: actionMap['example:get'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "get"', default_value: null },
        { action_id: actionMap['example:get'], param_name: 'tool', param_type: 'string', required: 0, description: 'Filter by tool', default_value: null },
        { action_id: actionMap['example:get'], param_name: 'action_name', param_type: 'string', required: 0, description: 'Filter by action', default_value: null },
        { action_id: actionMap['example:get'], param_name: 'topic', param_type: 'string', required: 0, description: 'Search by topic', default_value: null },
        // USE_CASE:LIST_ALL
        { action_id: actionMap['use_case:list_all'], param_name: 'action', param_type: 'string', required: 1, description: 'Must be "list_all"', default_value: null },
        { action_id: actionMap['use_case:list_all'], param_name: 'category', param_type: 'string', required: 0, description: 'Filter by category', default_value: null },
        { action_id: actionMap['use_case:list_all'], param_name: 'complexity', param_type: 'string', required: 0, description: 'Filter: basic, intermediate, advanced', default_value: null },
        { action_id: actionMap['use_case:list_all'], param_name: 'limit', param_type: 'number', required: 0, description: 'Maximum results', default_value: '20' }
      ].filter(p => p.action_id);

      if (params.length > 0) {
        await knex('v4_help_action_params').insert(params);
        console.log(`  ✓ Help action params seeded (${params.length})`);
      }
    }
  }

  // 6. Seed v4_help_use_cases (look up category IDs dynamically)
  const existingUseCases = await knex('v4_help_use_cases').count('* as count').first();
  if (!existingUseCases || Number(existingUseCases.count) === 0) {
    // Get category IDs by name
    const categories = await knex('v4_help_use_case_cats').select('id', 'category_name');
    const catMap: Record<string, number> = {};
    for (const c of categories) {
      catMap[c.category_name] = c.id;
    }

    await knex('v4_help_use_cases').insert([
      { category_id: catMap['task_management'], title: 'Create and track a development task', complexity: 'basic', description: 'Create a task with metadata, move through workflow, and complete it.', workflow: '1. task.create with title, layer, priority\n2. task.move to in_progress\n3. task.move to done' },
      { category_id: catMap['task_management'], title: 'Batch create sprint tasks', complexity: 'intermediate', description: 'Create multiple tasks at once for sprint planning.', workflow: '1. task.create_batch with array of task definitions\n2. task.add_dependency for dependencies\n3. task.list to verify' },
      { category_id: catMap['task_management'], title: 'Manage task dependencies', complexity: 'intermediate', description: 'Create blocking dependencies between tasks.', workflow: '1. task.create blocker task\n2. task.create blocked task\n3. task.add_dependency\n4. task.get_dependencies' },
      { category_id: catMap['decision_tracking'], title: 'Record an architecture decision', complexity: 'basic', description: 'Document an architectural choice with context.', workflow: '1. decision.set with key, value, layer, tags\n2. decision.add_decision_context with rationale\n3. decision.get to verify' },
      { category_id: catMap['decision_tracking'], title: 'Track decision versions', complexity: 'intermediate', description: 'Update a decision and view history.', workflow: '1. decision.set initial value\n2. decision.set updated value\n3. decision.versions to see history' },
      { category_id: catMap['file_tracking'], title: 'Record file changes', complexity: 'basic', description: 'Track file modifications with layer assignment.', workflow: '1. file.record with path, change_type, layer\n2. file.get to retrieve history' },
      { category_id: catMap['constraint_management'], title: 'Define project constraints', complexity: 'basic', description: 'Add architectural constraints with priority.', workflow: '1. constraint.add with text, category, priority\n2. constraint.get to list active constraints' },
      { category_id: catMap['cross_tool_workflow'], title: 'Full feature implementation workflow', complexity: 'advanced', description: 'Complete workflow from decision to implementation.', workflow: '1. decision.set for architectural choice\n2. constraint.add for requirements\n3. task.create for implementation\n4. task.link to decision and constraint\n5. file.record for changes\n6. task.move to done' },
      { category_id: catMap['decision_intelligence'], title: 'Check for duplicate decisions', complexity: 'basic', description: 'Prevent duplicate decisions with suggest tool.', workflow: '1. suggest.check_duplicate with proposed key\n2. Review suggestions\n3. Update existing or create new' },
      { category_id: catMap['decision_intelligence'], title: 'Find related decisions', complexity: 'intermediate', description: 'Discover related decisions by context.', workflow: '1. suggest.by_context with key, tags, layer\n2. Review suggestions with scores\n3. Link related decisions' }
    ]);
    console.log('  ✓ Help use cases seeded (10)');
  }

  console.log('🎉 Help system seed data completed!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Removing help system seed data...');

  // Clear seed data (preserve table structure)
  await knex('v4_help_use_cases').del();
  await knex('v4_help_action_params').del();
  await knex('v4_builtin_policies').del();
  await knex('v4_help_use_case_cats').del();
  await knex('v4_help_actions').del();
  await knex('v4_help_tools').del();

  console.log('✅ Help system seed data removed');
}
