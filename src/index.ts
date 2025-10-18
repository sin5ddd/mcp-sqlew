#!/usr/bin/env node
/**
 * MCP Shared Context Server - Entry Point
 * Provides context management tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initializeDatabase, closeDatabase, setConfigValue, getAllConfig } from './database.js';
import { CONFIG_KEYS } from './constants.js';
import { setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer, quickSetDecision, searchAdvanced, setDecisionBatch, hasUpdates, setFromTemplate, createTemplate, listTemplates, hardDeleteDecision, addDecisionContextAction, listDecisionContextsAction } from './tools/context.js';
import { sendMessage, getMessages, markRead, sendMessageBatch } from './tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch } from './tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint } from './tools/constraints.js';
import { getLayerSummary, clearOldData, getStats, getActivityLog, flushWAL } from './tools/utils.js';
import { getConfig, updateConfig } from './tools/config.js';
import { createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask, batchCreateTasks, addDependency, removeDependency, getDependencies, taskHelp } from './tools/tasks.js';
import { FileWatcher } from './watcher/index.js';

// Parse command-line arguments
const args = process.argv.slice(2);
const parsedArgs: {
  dbPath?: string;
  autodeleteIgnoreWeekend?: boolean;
  autodeleteMessageHours?: number;
  autodeleteFileHistoryDays?: number;
} = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg.startsWith('--db-path=')) {
    parsedArgs.dbPath = arg.split('=')[1];
  } else if (arg === '--db-path' && i + 1 < args.length) {
    parsedArgs.dbPath = args[++i];
  } else if (arg.startsWith('--autodelete-ignore-weekend=')) {
    const value = arg.split('=')[1].toLowerCase();
    parsedArgs.autodeleteIgnoreWeekend = value === 'true' || value === '1';
  } else if (arg === '--autodelete-ignore-weekend') {
    parsedArgs.autodeleteIgnoreWeekend = true;
  } else if (arg.startsWith('--autodelete-message-hours=')) {
    parsedArgs.autodeleteMessageHours = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--autodelete-message-hours' && i + 1 < args.length) {
    parsedArgs.autodeleteMessageHours = parseInt(args[++i], 10);
  } else if (arg.startsWith('--autodelete-file-history-days=')) {
    parsedArgs.autodeleteFileHistoryDays = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--autodelete-file-history-days' && i + 1 < args.length) {
    parsedArgs.autodeleteFileHistoryDays = parseInt(args[++i], 10);
  } else if (!arg.startsWith('--')) {
    // Backward compatibility: first non-flag argument is dbPath
    if (!parsedArgs.dbPath) {
      parsedArgs.dbPath = arg;
    }
  }
}

const dbPath = parsedArgs.dbPath;

// Initialize database
let db;
try {
  db = initializeDatabase(dbPath);

  // Apply CLI config overrides if provided
  if (parsedArgs.autodeleteIgnoreWeekend !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, parsedArgs.autodeleteIgnoreWeekend ? '1' : '0');
  }
  if (parsedArgs.autodeleteMessageHours !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, String(parsedArgs.autodeleteMessageHours));
  }
  if (parsedArgs.autodeleteFileHistoryDays !== undefined) {
    setConfigValue(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, String(parsedArgs.autodeleteFileHistoryDays));
  }

  // Display current config
  const config = getAllConfig(db);
  const ignoreWeekend = config[CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND] === '1';
  const messageHours = config[CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS];
  const fileHistoryDays = config[CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS];

  console.error('✓ MCP Shared Context Server initialized');
  console.error(`  Auto-delete config: messages=${messageHours}h, file_history=${fileHistoryDays}d, ignore_weekend=${ignoreWeekend}`);
} catch (error) {
  console.error('✗ Failed to initialize database:', error);
  process.exit(1);
}

// Create MCP server
const server = new Server(
  {
    name: 'mcp-sqlew',
    version: '3.2.2',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'decision',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Context Management - Store decisions with metadata (tags, layers, versions, scopes)

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'quick_set', 'search_advanced', 'set_batch', 'has_updates', 'set_from_template', 'create_template', 'list_templates', 'hard_delete', 'add_decision_context', 'list_decision_contexts', 'help', 'example']
            },
            key: { type: 'string' },
            value: { type: ['string', 'number'] },
            agent: { type: 'string' },
            layer: { type: 'string', enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'] },
            version: { type: 'string' },
            status: { type: 'string', enum: ['active', 'deprecated', 'draft'] },
            tags: { type: 'array', items: { type: 'string' } },
            scopes: { type: 'array', items: { type: 'string' } },
            scope: { type: 'string' },
            tag_match: { type: 'string', enum: ['AND', 'OR'] },
            include_tags: { type: 'boolean' },
            layers: { type: 'array', items: { type: 'string' } },
            tags_all: { type: 'array', items: { type: 'string' } },
            tags_any: { type: 'array', items: { type: 'string' } },
            exclude_tags: { type: 'array', items: { type: 'string' } },
            updated_after: { type: 'string' },
            updated_before: { type: 'string' },
            decided_by: { type: 'array', items: { type: 'string' } },
            statuses: { type: 'array', items: { type: 'string', enum: ['active', 'deprecated', 'draft'] } },
            search_text: { type: 'string' },
            sort_by: { type: 'string', enum: ['updated', 'key', 'version'] },
            sort_order: { type: 'string', enum: ['asc', 'desc'] },
            limit: { type: 'number' },
            offset: { type: 'number' },
            decisions: { type: 'array' },
            atomic: { type: 'boolean' },
            agent_name: { type: 'string' },
            since_timestamp: { type: 'string' },
            template: { type: 'string' },
            name: { type: 'string' },
            defaults: { type: 'object' },
            required_fields: { type: 'array', items: { type: 'string' } },
            created_by: { type: 'string' },
            rationale: { type: 'string' },
            alternatives_considered: { type: ['array', 'string'] },
            tradeoffs: { type: ['object', 'string'] },
            decision_key: { type: 'string' },
            related_task_id: { type: 'number' },
            related_constraint_id: { type: 'number' },
            include_context: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      {
        name: 'message',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Agent Messaging - Send messages between agents with priority levels and read tracking

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['send', 'get', 'mark_read', 'send_batch', 'help', 'example'] },
            agent_name: { type: 'string' },
            from_agent: { type: 'string' },
            to_agent: { type: ['string', 'null'] },
            msg_type: { type: 'string', enum: ['decision', 'warning', 'request', 'info'] },
            message: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            payload: { type: 'object' },
            message_ids: { type: 'array', items: { type: 'number' } },
            unread_only: { type: 'boolean', default: false },
            msg_type_filter: { type: 'string', enum: ['decision', 'warning', 'request', 'info'] },
            priority_filter: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            limit: { type: 'number', default: 50 },
            // send_batch parameters
            messages: { type: 'array', description: 'Array of messages for batch operation (max: 50)' },
            atomic: { type: 'boolean', description: 'Atomic mode - all succeed or all fail (default: true)' },
          },
          required: ['action'],
        },
      },
      {
        name: 'file',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

File Change Tracking - Track file changes with layer classification and lock detection

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['record', 'get', 'check_lock', 'record_batch', 'help', 'example'] },
            file_path: { type: 'string' },
            agent_name: { type: 'string' },
            change_type: { type: 'string', enum: ['created', 'modified', 'deleted'] },
            layer: { type: 'string', enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'] },
            description: { type: 'string' },
            since: { type: 'string' },
            limit: { type: 'number' },
            lock_duration: { type: 'number' },
            // record_batch parameters
            file_changes: { type: 'array', description: 'Array of file changes for batch operation (max: 50)' },
            atomic: { type: 'boolean', description: 'Atomic mode - all succeed or all fail (default: true)' },
          },
          required: ['action'],
        },
      },
      {
        name: 'constraint',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Constraint Management - Manage architectural rules and requirements

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['add', 'get', 'deactivate', 'help', 'example'] },
            constraint_id: { type: 'number' },
            category: { type: 'string', enum: ['performance', 'architecture', 'security'] },
            constraint_text: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            layer: { type: 'string', enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'] },
            tags: { type: 'array', items: { type: 'string' } },
            created_by: { type: 'string' },
            active_only: { type: 'boolean', default: true },
            limit: { type: 'number', default: 50 },
          },
          required: ['action'],
        },
      },
      {
        name: 'stats',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Statistics & Utilities - View stats, activity logs, manage data cleanup, and WAL checkpoints

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['layer_summary', 'db_stats', 'clear', 'activity_log', 'flush', 'help', 'example'] },
            messages_older_than_hours: { type: 'number' },
            file_changes_older_than_days: { type: 'number' },
            since: { type: 'string', description: 'Time filter (e.g., "5m", "1h", "2d" or ISO timestamp)' },
            agent_names: { type: 'array', items: { type: 'string' }, description: 'Filter by agents' },
            actions: { type: 'array', items: { type: 'string' }, description: 'Filter by action types' },
            limit: { type: 'number', description: 'Max results (default: 100)' },
          },
          required: ['action'],
        },
      },
      {
        name: 'config',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Configuration - Manage auto-deletion settings with weekend-aware retention

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['get', 'update', 'help', 'example'] },
            ignoreWeekend: { type: 'boolean' },
            messageRetentionHours: { type: 'number', minimum: 1, maximum: 168 },
            fileHistoryRetentionDays: { type: 'number', minimum: 1, maximum: 90 },
          },
          required: ['action'],
        },
      },
      {
        name: 'task',
        description: `**REQUIRED PARAMETER**: action (must be specified in ALL calls)

Kanban Task Watcher - AI-optimized task management with auto-stale detection

Use action: "help" for detailed documentation.
Use action: "example" for comprehensive usage examples.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['create', 'update', 'get', 'list', 'move', 'link', 'archive', 'batch_create', 'help', 'example'] },
            task_id: { type: 'number' },
            title: { type: 'string' },
            description: { type: 'string' },
            acceptance_criteria: { type: 'string' },
            notes: { type: 'string' },
            priority: { type: 'number', minimum: 1, maximum: 4 },
            assigned_agent: { type: 'string' },
            created_by_agent: { type: 'string' },
            layer: { type: 'string', enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'] },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'] },
            new_status: { type: 'string', enum: ['todo', 'in_progress', 'waiting_review', 'blocked', 'done', 'archived'] },
            link_type: { type: 'string', enum: ['decision', 'constraint', 'file'] },
            target_id: { type: ['string', 'number'] },
            link_relation: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            // batch_create parameters
            tasks: { type: 'array', description: 'Array of tasks for batch operation (max: 50)' },
            atomic: { type: 'boolean', description: 'Atomic mode - all succeed or all fail (default: true)' },
          },
          required: ['action'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as any;

  try {
    let result;

    switch (name) {
      case 'decision':
        switch (params.action) {
          case 'set': result = setDecision(params); break;
          case 'get': result = getDecision(params); break;
          case 'list': result = getContext(params); break;
          case 'search_tags': result = searchByTags({ tags: params.tags, match_mode: params.tag_match, status: params.status, layer: params.layer }); break;
          case 'search_layer': result = searchByLayer({ layer: params.layer, status: params.status, include_tags: params.include_tags }); break;
          case 'versions': result = getVersions(params); break;
          case 'quick_set': result = quickSetDecision(params); break;
          case 'search_advanced': result = searchAdvanced({
            layers: params.layers,
            tags_all: params.tags_all,
            tags_any: params.tags_any,
            exclude_tags: params.exclude_tags,
            scopes: params.scopes,
            updated_after: params.updated_after,
            updated_before: params.updated_before,
            decided_by: params.decided_by,
            statuses: params.statuses,
            search_text: params.search_text,
            sort_by: params.sort_by,
            sort_order: params.sort_order,
            limit: params.limit,
            offset: params.offset
          }); break;
          case 'set_batch': result = setDecisionBatch({ decisions: params.decisions, atomic: params.atomic }); break;
          case 'has_updates': result = hasUpdates({ agent_name: params.agent_name, since_timestamp: params.since_timestamp }); break;
          case 'set_from_template': result = setFromTemplate(params); break;
          case 'create_template': result = createTemplate(params); break;
          case 'list_templates': result = listTemplates(params); break;
          case 'hard_delete': result = hardDeleteDecision(params); break;
          case 'add_decision_context': result = addDecisionContextAction(params); break;
          case 'list_decision_contexts': result = listDecisionContextsAction(params); break;
          case 'help': result = {
            tool: 'decision',
            description: 'Manage decisions with metadata (tags, layers, versions, scopes)',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all decision actions.',
            purpose: {
              title: '⚠️ CRITICAL: Store WHY and REASON, Not WHAT',
              principle: 'Decisions table is for ARCHITECTURAL CONTEXT and REASONING, NOT implementation logs or task completion status',
              what_to_store: {
                correct: [
                  'WHY a design choice was made (e.g., "Chose JWT over sessions because stateless auth scales better for our microservice architecture")',
                  'REASONING behind architecture decisions (e.g., "Moved oscillator_type to MonophonicSynthConfig to separate synthesis methods - FM operators use different config")',
                  'PROBLEM ANALYSIS and solution rationale (e.g., "Nested transaction bug: setDecision wraps in transaction, batch also wraps → solution: extract internal helper without transaction wrapper")',
                  'DESIGN TRADE-OFFS and alternatives considered (e.g., "Query builder limited to simple filters, kept domain-specific logic inline for maintainability")',
                  'CONSTRAINTS and requirements reasoning (e.g., "API response must be <100ms because mobile clients timeout at 200ms")',
                  'BREAKING CHANGES with migration rationale (e.g., "Removed /v1/users endpoint - clients must use /v2/users with pagination for scalability")'
                ],
                incorrect: [
                  '❌ Task completion logs (e.g., "Task 5 completed", "Refactoring done", "Tests passing") → Use tasks tool instead',
                  '❌ Implementation status (e.g., "Added validators.ts", "Fixed bug in batch_create", "Updated README") → These are WHAT, not WHY',
                  '❌ Test results (e.g., "All tests passing", "Integration tests complete", "v3.0.2 testing verified") → Temporary status, not architectural context',
                  '❌ Git commit summaries (e.g., "Released v3.0.2", "Created git commit 2bf55a0") → Belongs in git history',
                  '❌ Documentation updates (e.g., "README reorganized", "Help actions enhanced") → Implementation logs, not decisions',
                  '❌ Build status (e.g., "Build succeeded", "TypeScript compiled with zero errors") → Temporary status'
                ]
              },
              analogy: {
                git_history: 'WHAT changed (files, lines, commits)',
                code_comments: 'HOW it works (implementation details, algorithms)',
                sqlew_decisions: 'WHY it was changed (reasoning, trade-offs, context)',
                sqlew_tasks: 'WHAT needs to be done (work items, status, completion)'
              },
              examples: [
                {
                  key: 'api/auth/jwt-choice',
                  value: 'Chose JWT over session-based auth because: (1) Stateless design scales horizontally, (2) Mobile clients can cache tokens, (3) Microservice architecture requires distributed auth. Trade-off: Revocation requires token blacklist, but acceptable for 15-min token lifetime.',
                  explanation: 'Explains WHY JWT was chosen, considers trade-offs, provides architectural context'
                },
                {
                  key: 'database/postgresql-choice',
                  value: 'Selected PostgreSQL over MongoDB because: (1) Complex relational queries required for reporting, (2) ACID compliance critical for financial data, (3) Team has strong SQL expertise. Trade-off: Less flexible schema, but data integrity more important than schema flexibility for our use case.',
                  explanation: 'Documents database choice with reasoning, alternatives considered, and trade-offs'
                },
                {
                  key: 'security/encryption-at-rest',
                  value: 'Implementing AES-256 encryption for all PII in database because: (1) GDPR compliance requires encryption at rest, (2) Recent security audit identified unencrypted sensitive data, (3) Performance impact <5ms per query acceptable. Alternative considered: Database-level encryption rejected due to backup/restore complexity.',
                  explanation: 'Explains security decision with compliance reasoning and performance considerations'
                }
              ],
              cleanup_rule: 'Delete decisions that start with "COMPLETED:", contain task status, test results, or implementation logs. Keep only architectural reasoning and design rationale.'
            },
            actions: {
              set: 'Set/update a decision. Params: key (required), value (required), agent, layer, version, status, tags, scopes',
              get: 'Get specific decision by key. Params: key (required), include_context (optional, boolean, default: false). When include_context=true, returns decision with attached context (rationale, alternatives, tradeoffs). Backward compatible - omitting flag returns standard decision format.',
              list: 'List/filter decisions. Params: status, layer, tags, scope, tag_match',
              search_tags: 'Search decisions by tags. Params: tags (required), match_mode, status, layer',
              search_layer: 'Search decisions by layer. Params: layer (required), status, include_tags',
              versions: 'Get version history for a decision. Params: key (required)',
              quick_set: 'Quick set with smart defaults (FR-002). Params: key (required), value (required), agent, layer, version, status, tags, scopes. Auto-infers layer from key prefix (api/*→presentation, db/*→data, service/*→business, config/*→infrastructure), tags from key hierarchy, scope from parent path. Defaults: status=active, version=1.0.0. All inferred fields can be overridden.',
              search_advanced: 'Advanced query with complex filtering (FR-004). Params: layers (OR), tags_all (AND), tags_any (OR), exclude_tags, scopes (wildcards), updated_after/before (ISO or relative like "7d"), decided_by, statuses, search_text, sort_by (updated/key/version), sort_order (asc/desc), limit (default:20, max:1000), offset (default:0). Returns decisions with total_count for pagination. All filters use parameterized queries (SQL injection protection).',
              set_batch: 'Batch set decisions (FR-005). Params: decisions (required, array of SetDecisionParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE BEHAVIOR (atomic: true): All decisions succeed or all fail as a single transaction. If ANY decision fails, entire batch is rolled back and error is thrown. Use for critical operations requiring consistency. NON-ATOMIC MODE (atomic: false): Each decision is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. Use for best-effort batch operations or when individual failures are acceptable. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default to avoid transaction failures from validation errors or malformed data. Only use atomic:true when all-or-nothing guarantee is required. 52% token reduction vs individual calls.',
              has_updates: 'Check for updates since timestamp (FR-003 Phase A - Lightweight Polling). Params: agent_name (required), since_timestamp (required, ISO 8601 format like "2025-10-14T08:00:00Z"). Returns: {has_updates: boolean, counts: {decisions: N, messages: N, files: N}}. Token cost: ~5-10 tokens per check. Uses COUNT queries on t_decisions, t_agent_messages, t_file_changes with timestamp filtering. Enables efficient polling without full data retrieval.',
              set_from_template: 'Set decision using template (FR-006). Params: template (required, template name), key (required), value (required), agent, layer (override), version, status (override), tags (override), scopes, plus any template-required fields. Applies template defaults (layer, status, tags) while allowing overrides. Validates required fields if specified by template. Returns: {success, key, key_id, version, template_used, applied_defaults, message}. Built-in templates: breaking_change, security_vulnerability, performance_optimization, deprecation, architecture_decision.',
              create_template: 'Create new decision template (FR-006). Params: name (required, unique), defaults (required, object with layer/status/tags/priority), required_fields (optional, array of field names), created_by (optional, agent name). Returns: {success, template_id, template_name, message}. Example defaults: {"layer":"business","status":"active","tags":["breaking"]}. Validates layer/status values.',
              list_templates: 'List all decision templates (FR-006). No params required. Returns: {templates: [{id, name, defaults, required_fields, created_by, created_at}], count}. Shows both built-in and custom templates.',
              hard_delete: 'Permanently delete a decision (hard delete). Params: key (required). WARNING: IRREVERSIBLE - removes all records including version history, tags, scopes. Use cases: manual cleanup after decision-to-task migration, remove test/debug decisions, purge sensitive data. Unlike soft delete (status=deprecated), this completely removes from database. Idempotent - safe to call even if already deleted. Returns: {success, key, message}.',
              add_decision_context: 'Add rich context to a decision (v3.2.2). Params: key (required), rationale (required), alternatives_considered (optional, JSON array), tradeoffs (optional, JSON object with pros/cons), decided_by (optional), related_task_id (optional), related_constraint_id (optional). Use to document WHY decisions were made, what alternatives were considered, and trade-offs. Multiple contexts can be attached to the same decision over time. Returns: {success, context_id, decision_key, message}.',
              list_decision_contexts: 'List decision contexts with filters (v3.2.2). Params: decision_key (optional), related_task_id (optional), related_constraint_id (optional), decided_by (optional), limit (default: 50), offset (default: 0). Returns: {success, contexts: [{id, decision_key, rationale, alternatives_considered, tradeoffs, decided_by, decision_date, related_task_id, related_constraint_id}], count}. JSON fields (alternatives, tradeoffs) are automatically parsed.'
            },
            examples: {
              set: '{ action: "set", key: "auth_method", value: "jwt", tags: ["security"] }',
              get: '{ action: "get", key: "auth_method" }',
              list: '{ action: "list", status: "active", layer: "infrastructure" }',
              search_tags: '{ action: "search_tags", tags: ["security", "api"] }',
              quick_set: '{ action: "quick_set", key: "api/instruments/oscillator-refactor", value: "Moved oscillator_type to MonophonicSynthConfig" }',
              search_advanced: '{ action: "search_advanced", layers: ["business", "data"], tags_all: ["breaking", "v0.3.3"], tags_any: ["api", "synthesis"], exclude_tags: ["deprecated"], scopes: ["api/instruments/*"], updated_after: "2025-10-01", statuses: ["active", "draft"], search_text: "oscillator", sort_by: "updated", sort_order: "desc", limit: 20, offset: 0 }',
              set_batch: '{ action: "set_batch", decisions: [{"key": "feat-1", "value": "...", "layer": "business"}, {"key": "feat-2", "value": "...", "layer": "data"}], atomic: true }',
              has_updates: '{ action: "has_updates", agent_name: "my-agent", since_timestamp: "2025-10-14T08:00:00Z" }',
              set_from_template: '{ action: "set_from_template", template: "breaking_change", key: "oscillator-type-moved", value: "oscillator_type moved to MonophonicSynthConfig" }',
              create_template: '{ action: "create_template", name: "bug_fix", defaults: {"layer":"business","tags":["bug","fix"],"status":"active"}, created_by: "my-agent" }',
              list_templates: '{ action: "list_templates" }',
              hard_delete: '{ action: "hard_delete", key: "task_old_authentication_refactor" }'
            },
            documentation: {
              tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, tool comparison, when to use each tool (236 lines, ~12k tokens)',
              tool_reference: 'docs/TOOL_REFERENCE.md - Parameter requirements, batch operations, templates (471 lines, ~24k tokens)',
              workflows: 'docs/WORKFLOWS.md - Multi-step workflow examples, multi-agent coordination (602 lines, ~30k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - Common errors, best practices, troubleshooting (345 lines, ~17k tokens)',
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (status/layer/priority), atomic mode (339 lines, ~17k tokens)'
            }
          }; break;
          case 'example': result = {
            tool: 'decision',
            description: 'Comprehensive decision tool examples without needing WebFetch access',
            scenarios: {
              basic_usage: {
                title: 'Basic Decision Management',
                examples: [
                  {
                    scenario: 'Record API design decision',
                    request: '{ action: "set", key: "api_auth_method", value: "JWT with refresh tokens", layer: "business", tags: ["api", "security", "authentication"] }',
                    explanation: 'Documents the choice of authentication method for the API'
                  },
                  {
                    scenario: 'Retrieve a decision',
                    request: '{ action: "get", key: "api_auth_method" }',
                    response_structure: '{ key, value, layer, status, version, tags, scopes, decided_by, updated_at }'
                  },
                  {
                    scenario: 'List all active decisions',
                    request: '{ action: "list", status: "active", limit: 20 }',
                    explanation: 'Returns active decisions with metadata for browsing'
                  }
                ]
              },
              advanced_filtering: {
                title: 'Advanced Search and Filtering',
                examples: [
                  {
                    scenario: 'Find all security-related decisions in business layer',
                    request: '{ action: "search_advanced", layers: ["business"], tags_any: ["security", "authentication"], status: ["active"], sort_by: "updated", sort_order: "desc" }',
                    explanation: 'Combines layer filtering, tag matching, and sorting'
                  },
                  {
                    scenario: 'Search within API scope with multiple tags',
                    request: '{ action: "search_advanced", scopes: ["api/*"], tags_all: ["breaking", "v2.0"], updated_after: "2025-01-01" }',
                    explanation: 'Uses scope wildcards and timestamp filtering for recent breaking changes'
                  }
                ]
              },
              versioning_workflow: {
                title: 'Version Management',
                steps: [
                  {
                    step: 1,
                    action: 'Create initial decision',
                    request: '{ action: "set", key: "database_choice", value: "PostgreSQL", layer: "data", version: "1.0.0", tags: ["database"] }'
                  },
                  {
                    step: 2,
                    action: 'Update decision (creates new version)',
                    request: '{ action: "set", key: "database_choice", value: "PostgreSQL with read replicas", layer: "data", version: "1.1.0", tags: ["database", "scaling"] }'
                  },
                  {
                    step: 3,
                    action: 'View version history',
                    request: '{ action: "versions", key: "database_choice" }',
                    result: 'Returns all versions with timestamps and changes'
                  }
                ]
              },
              batch_operations: {
                title: 'Batch Decision Management',
                examples: [
                  {
                    scenario: 'Record multiple related decisions atomically',
                    request: '{ action: "set_batch", decisions: [{"key": "cache_layer", "value": "Redis", "layer": "infrastructure"}, {"key": "cache_ttl", "value": "3600", "layer": "infrastructure"}], atomic: true }',
                    explanation: 'All decisions succeed or all fail together (atomic mode)'
                  },
                  {
                    scenario: 'Best-effort batch insert',
                    request: '{ action: "set_batch", decisions: [{...}, {...}, {...}], atomic: false }',
                    explanation: 'Each decision processed independently - partial success allowed'
                  }
                ]
              },
              templates: {
                title: 'Using Decision Templates',
                examples: [
                  {
                    scenario: 'Use built-in breaking_change template',
                    request: '{ action: "set_from_template", template: "breaking_change", key: "api_remove_legacy_endpoint", value: "Removed /v1/users endpoint - migrate to /v2/users" }',
                    explanation: 'Automatically applies layer=business, tags=["breaking"], status=active'
                  },
                  {
                    scenario: 'Create custom template',
                    request: '{ action: "create_template", name: "feature_flag", defaults: {"layer": "presentation", "tags": ["feature-flag"], "status": "draft"}, created_by: "backend-team" }',
                    explanation: 'Define reusable templates for common decision patterns'
                  }
                ]
              },
              quick_set_inference: {
                title: 'Quick Set with Smart Defaults',
                examples: [
                  {
                    scenario: 'Auto-infer layer from key prefix',
                    request: '{ action: "quick_set", key: "api/instruments/oscillator-refactor", value: "Moved oscillator_type to MonophonicSynthConfig" }',
                    inferred: 'layer=presentation (from api/*), tags=["instruments", "oscillator-refactor"], scope=api/instruments'
                  },
                  {
                    scenario: 'Database decision with auto-inference',
                    request: '{ action: "quick_set", key: "db/users/add-email-index", value: "Added index on email column" }',
                    inferred: 'layer=data (from db/*), tags=["users", "add-email-index"]'
                  }
                ]
              }
            },
            best_practices: {
              key_naming: [
                'Use hierarchical keys: "api/users/authentication"',
                'Prefix with layer hint: api/* → presentation, db/* → data, service/* → business',
                'Use descriptive names that explain the decision context'
              ],
              tagging: [
                'Tag with relevant categories: security, performance, breaking, etc.',
                'Include version tags for release-specific decisions',
                'Use consistent tag naming conventions across team'
              ],
              versioning: [
                'Use semantic versioning: 1.0.0, 1.1.0, 2.0.0',
                'Increment major version for breaking changes',
                'Document rationale in decision value text'
              ],
              cleanup: [
                'Mark deprecated decisions with status="deprecated"',
                'Use hard_delete only for sensitive data or migration cleanup',
                'Link related decisions using scopes'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'message':
        switch (params.action) {
          case 'send': result = sendMessage(params); break;
          case 'get': result = getMessages(params); break;
          case 'mark_read': result = markRead(params); break;
          case 'send_batch': result = sendMessageBatch({ messages: params.messages, atomic: params.atomic }); break;
          case 'help': result = {
            tool: 'message',
            description: 'Send and retrieve messages between agents with priority levels',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all message actions.',
            actions: {
              send: 'Send message. Params: from_agent (required), msg_type (required), message (required), to_agent, priority, payload',
              get: 'Get messages for agent. Params: agent_name (required), unread_only, priority_filter, msg_type_filter, limit',
              mark_read: 'Mark messages as read. Params: agent_name (required), message_ids (required)',
              send_batch: 'Batch send messages (FR-005). Params: messages (required, array of SendMessageParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE (atomic: true): All messages succeed or all fail as a single transaction. If ANY message fails, entire batch is rolled back and error is thrown. NON-ATOMIC MODE (atomic: false): Each message is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default for best-effort delivery. Use atomic:true only when all-or-nothing guarantee is required. 52% token reduction vs individual calls.'
            },
            examples: {
              send: '{ action: "send", from_agent: "bot1", msg_type: "info", message: "Task complete", priority: "high" }',
              get: '{ action: "get", agent_name: "bot1", unread_only: true }',
              mark_read: '{ action: "mark_read", agent_name: "bot1", message_ids: [1, 2, 3] }',
              send_batch: '{ action: "send_batch", messages: [{"from_agent": "bot1", "msg_type": "info", "message": "Task 1 done"}, {"from_agent": "bot1", "msg_type": "info", "message": "Task 2 done"}], atomic: true }'
            },
            documentation: {
              workflows: 'docs/WORKFLOWS.md - Multi-agent coordination, messaging patterns, cross-session handoffs (602 lines, ~30k tokens)',
              tool_reference: 'docs/TOOL_REFERENCE.md - Message tool parameters, batch operations (471 lines, ~24k tokens)',
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Enum values (msg_type/priority), atomic mode (339 lines, ~17k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - Common errors, messaging best practices (345 lines, ~17k tokens)'
            }
          }; break;
          case 'example': result = {
            tool: 'message',
            description: 'Comprehensive messaging examples for multi-agent coordination',
            scenarios: {
              basic_messaging: {
                title: 'Basic Agent Communication',
                examples: [
                  {
                    scenario: 'Send info message between agents',
                    request: '{ action: "send", from_agent: "backend-agent", to_agent: "frontend-agent", msg_type: "info", message: "API endpoint /users is ready" }',
                    explanation: 'Direct message from one agent to another'
                  },
                  {
                    scenario: 'Broadcast message to all agents',
                    request: '{ action: "send", from_agent: "coordinator", to_agent: null, msg_type: "info", message: "Deployment starting in 5 minutes", priority: "high" }',
                    explanation: 'null to_agent broadcasts to all agents'
                  },
                  {
                    scenario: 'Get unread messages',
                    request: '{ action: "get", agent_name: "frontend-agent", unread_only: true }',
                    explanation: 'Retrieve only unread messages for an agent'
                  }
                ]
              },
              priority_messaging: {
                title: 'Priority-Based Communication',
                examples: [
                  {
                    scenario: 'Critical error notification',
                    request: '{ action: "send", from_agent: "monitoring-agent", msg_type: "warning", message: "Database connection lost", priority: "critical" }',
                    explanation: 'High-priority messages for urgent issues'
                  },
                  {
                    scenario: 'Filter by priority',
                    request: '{ action: "get", agent_name: "ops-agent", priority_filter: "critical" }',
                    explanation: 'Get only critical priority messages'
                  }
                ]
              },
              workflow_coordination: {
                title: 'Multi-Step Workflow',
                steps: [
                  {
                    step: 1,
                    action: 'Agent A requests work from Agent B',
                    request: '{ action: "send", from_agent: "agent-a", to_agent: "agent-b", msg_type: "request", message: "Please process user data batch-123" }'
                  },
                  {
                    step: 2,
                    action: 'Agent B checks messages',
                    request: '{ action: "get", agent_name: "agent-b", msg_type_filter: "request", unread_only: true }'
                  },
                  {
                    step: 3,
                    action: 'Agent B marks as read and processes',
                    request: '{ action: "mark_read", agent_name: "agent-b", message_ids: [123] }'
                  },
                  {
                    step: 4,
                    action: 'Agent B sends completion notification',
                    request: '{ action: "send", from_agent: "agent-b", to_agent: "agent-a", msg_type: "info", message: "Batch-123 processing complete" }'
                  }
                ]
              },
              batch_messaging: {
                title: 'Batch Message Operations',
                examples: [
                  {
                    scenario: 'Send multiple status updates atomically',
                    request: '{ action: "send_batch", messages: [{"from_agent": "worker-1", "msg_type": "info", "message": "Task 1 done"}, {"from_agent": "worker-1", "msg_type": "info", "message": "Task 2 done"}], atomic: true }',
                    explanation: 'All messages sent or none (atomic mode)'
                  },
                  {
                    scenario: 'Best-effort batch sending',
                    request: '{ action: "send_batch", messages: [{...}, {...}], atomic: false }',
                    explanation: 'Each message sent independently - partial success allowed'
                  }
                ]
              }
            },
            best_practices: {
              message_types: [
                'Use "decision" for recording important choices',
                'Use "warning" for errors or issues requiring attention',
                'Use "request" for work requests between agents',
                'Use "info" for status updates and notifications'
              ],
              priority_usage: [
                'critical: System failures, data loss, security breaches',
                'high: Important but not emergency (deployment notifications)',
                'medium: Regular coordination messages (default)',
                'low: Optional information, logging'
              ],
              coordination_patterns: [
                'Always mark messages as read after processing',
                'Use broadcast (to_agent=null) for system-wide announcements',
                'Filter by msg_type when checking for specific message categories',
                'Include context in message text or payload for debugging'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'file':
        switch (params.action) {
          case 'record': result = recordFileChange(params); break;
          case 'get': result = getFileChanges(params); break;
          case 'check_lock': result = checkFileLock(params); break;
          case 'record_batch': result = recordFileChangeBatch({ file_changes: params.file_changes, atomic: params.atomic }); break;
          case 'help': result = {
            tool: 'file',
            description: 'Track file changes across agents with layer classification',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all file tracking actions.',
            actions: {
              record: 'Record file change. Params: file_path (required), agent_name (required), change_type (required), layer, description',
              get: 'Get file changes. Params: file_path, agent_name, layer, change_type, since, limit',
              check_lock: 'Check if file locked. Params: file_path (required), lock_duration',
              record_batch: 'Batch record file changes (FR-005). Params: file_changes (required, array of RecordFileChangeParams, max: 50), atomic (optional, boolean, default: true). Returns: {success, inserted, failed, results}. ATOMIC MODE (atomic: true): All file changes succeed or all fail as a single transaction. If ANY record fails, entire batch is rolled back and error is thrown. NON-ATOMIC MODE (atomic: false): Each file change is processed independently. If some fail, others still succeed. Returns partial results with per-item success/error status. RECOMMENDATION FOR AI AGENTS: Use atomic:false by default for best-effort recording. Use atomic:true only when all-or-nothing guarantee is required. 52% token reduction vs individual calls.'
            },
            examples: {
              record: '{ action: "record", file_path: "src/index.ts", agent_name: "refactor-bot", change_type: "modified", layer: "infrastructure" }',
              get: '{ action: "get", agent_name: "refactor-bot", layer: "infrastructure", limit: 10 }',
              check_lock: '{ action: "check_lock", file_path: "src/index.ts", lock_duration: 300 }',
              record_batch: '{ action: "record_batch", file_changes: [{"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}, {"file_path": "src/index.ts", "agent_name": "bot1", "change_type": "modified", "layer": "infrastructure"}], atomic: true }'
            },
            documentation: {
              workflows: 'docs/WORKFLOWS.md - File locking patterns, concurrent file access workflows (602 lines, ~30k tokens)',
              tool_reference: 'docs/TOOL_REFERENCE.md - File tool parameters, batch operations (471 lines, ~24k tokens)',
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (change_type), atomic mode (339 lines, ~17k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - File tracking best practices (345 lines, ~17k tokens)'
            }
          }; break;
          case 'example': result = {
            tool: 'file',
            description: 'Comprehensive file tracking examples for multi-agent coordination',
            scenarios: {
              basic_tracking: {
                title: 'Basic File Change Tracking',
                examples: [
                  {
                    scenario: 'Record file modification',
                    request: '{ action: "record", file_path: "src/api/users.ts", agent_name: "refactor-agent", change_type: "modified", layer: "business", description: "Added email validation" }',
                    explanation: 'Track changes with layer and description'
                  },
                  {
                    scenario: 'Get recent changes by agent',
                    request: '{ action: "get", agent_name: "refactor-agent", limit: 10 }',
                    explanation: 'View what an agent has been working on'
                  },
                  {
                    scenario: 'Track changes to specific file',
                    request: '{ action: "get", file_path: "src/api/users.ts" }',
                    explanation: 'See all modifications to a particular file'
                  }
                ]
              },
              file_locking: {
                title: 'Concurrent Access Prevention',
                workflow: [
                  {
                    step: 1,
                    action: 'Check if file is locked',
                    request: '{ action: "check_lock", file_path: "src/database/schema.sql", lock_duration: 300 }',
                    result: '{ locked: false } or { locked: true, locked_by: "agent-name", locked_at: "timestamp" }'
                  },
                  {
                    step: 2,
                    action: 'If not locked, record change (creates lock)',
                    request: '{ action: "record", file_path: "src/database/schema.sql", agent_name: "migration-agent", change_type: "modified" }'
                  },
                  {
                    step: 3,
                    action: 'Lock expires after 5 minutes (default) or specified duration'
                  }
                ]
              },
              layer_organization: {
                title: 'Tracking by Architecture Layer',
                examples: [
                  {
                    scenario: 'Get all presentation layer changes',
                    request: '{ action: "get", layer: "presentation", limit: 20 }',
                    explanation: 'View frontend/UI changes across agents'
                  },
                  {
                    scenario: 'Track infrastructure changes',
                    request: '{ action: "get", layer: "infrastructure", change_type: "modified" }',
                    explanation: 'Monitor config and deployment file changes'
                  }
                ]
              },
              batch_tracking: {
                title: 'Batch File Operations',
                examples: [
                  {
                    scenario: 'Record multiple file changes atomically',
                    request: '{ action: "record_batch", file_changes: [{"file_path": "src/api.ts", "agent_name": "bot1", "change_type": "modified", "layer": "presentation"}, {"file_path": "src/types.ts", "agent_name": "bot1", "change_type": "modified", "layer": "data"}], atomic: true }',
                    explanation: 'All changes recorded or none (transaction)'
                  }
                ]
              }
            },
            best_practices: {
              change_tracking: [
                'Always specify layer for better organization',
                'Include description for non-obvious changes',
                'Use check_lock before modifying shared files',
                'Track both creation and deletion of files'
              ],
              lock_management: [
                'Default lock duration is 300 seconds (5 minutes)',
                'Locks prevent concurrent modifications',
                'Locks auto-expire - no manual unlock needed',
                'Use appropriate lock_duration for operation complexity'
              ],
              layer_assignment: [
                'presentation: UI components, API controllers',
                'business: Services, domain logic',
                'data: Models, repositories, migrations',
                'infrastructure: Config, deployment, CI/CD',
                'cross-cutting: Utilities used across layers'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'constraint':
        switch (params.action) {
          case 'add': result = addConstraint(params); break;
          case 'get': result = getConstraints(params); break;
          case 'deactivate': result = deactivateConstraint(params); break;
          case 'help': result = {
            tool: 'constraint',
            description: 'Manage project constraints (performance, architecture, security)',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all constraint actions.',
            actions: {
              add: 'Add constraint. Params: category (required), constraint_text (required), priority, layer, tags, created_by',
              get: 'Get constraints. Params: category, layer, priority, tags, active_only, limit',
              deactivate: 'Deactivate constraint. Params: constraint_id (required)'
            },
            examples: {
              add: '{ action: "add", category: "performance", constraint_text: "API response time <100ms", priority: "high", tags: ["api"] }',
              get: '{ action: "get", category: "performance", active_only: true }',
              deactivate: '{ action: "deactivate", constraint_id: 5 }'
            },
            documentation: {
              tool_selection: 'docs/TOOL_SELECTION.md - Decision tree, constraint vs decision comparison (236 lines, ~12k tokens)',
              workflows: 'docs/WORKFLOWS.md - Constraint validation workflows, requirement tracking (602 lines, ~30k tokens)',
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions, enum values (category/priority) (339 lines, ~17k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - When to use constraints, common patterns (345 lines, ~17k tokens)'
            }
          }; break;
          case 'example': result = {
            tool: 'constraint',
            description: 'Comprehensive constraint examples for various use cases',
            categories: {
              performance: {
                description: 'Performance-related constraints for response times, throughput, resource usage',
                examples: [
                  {
                    scenario: 'API Response Time',
                    example: '{ action: "add", category: "performance", constraint_text: "All API endpoints must respond within 100ms for 95th percentile", priority: "high", layer: "business", tags: ["api", "latency"] }',
                    rationale: 'Ensures fast user experience and prevents timeout issues'
                  },
                  {
                    scenario: 'Database Query Performance',
                    example: '{ action: "add", category: "performance", constraint_text: "Database queries must complete within 50ms", priority: "high", layer: "data", tags: ["database", "query"] }',
                    rationale: 'Prevents database bottlenecks and ensures scalability'
                  },
                  {
                    scenario: 'Memory Usage',
                    example: '{ action: "add", category: "performance", constraint_text: "Peak memory usage must not exceed 512MB per instance", priority: "critical", layer: "infrastructure", tags: ["memory", "resource"] }',
                    rationale: 'Prevents out-of-memory errors in containerized environments'
                  }
                ]
              },
              architecture: {
                description: 'Architectural constraints for code structure, dependencies, patterns',
                examples: [
                  {
                    scenario: 'Layer Dependency Rules',
                    example: '{ action: "add", category: "architecture", constraint_text: "Presentation layer must not directly access data layer - use business layer only", priority: "critical", layer: "cross-cutting", tags: ["layering", "separation"] }',
                    rationale: 'Enforces clean architecture and separation of concerns'
                  },
                  {
                    scenario: 'Dependency Injection',
                    example: '{ action: "add", category: "architecture", constraint_text: "All service classes must use constructor-based dependency injection", priority: "medium", layer: "business", tags: ["di", "testability"] }',
                    rationale: 'Improves testability and reduces coupling'
                  },
                  {
                    scenario: 'API Versioning',
                    example: '{ action: "add", category: "architecture", constraint_text: "All public APIs must include version prefix (e.g., /v1/, /v2/)", priority: "high", layer: "presentation", tags: ["api", "versioning"] }',
                    rationale: 'Enables backward compatibility and smooth API evolution'
                  }
                ]
              },
              security: {
                description: 'Security constraints for authentication, authorization, data protection',
                examples: [
                  {
                    scenario: 'Authentication Required',
                    example: '{ action: "add", category: "security", constraint_text: "All non-public endpoints must require JWT authentication", priority: "critical", layer: "presentation", tags: ["auth", "jwt"] }',
                    rationale: 'Prevents unauthorized access to protected resources'
                  },
                  {
                    scenario: 'Data Encryption',
                    example: '{ action: "add", category: "security", constraint_text: "All PII (Personally Identifiable Information) must be encrypted at rest using AES-256", priority: "critical", layer: "data", tags: ["encryption", "pii"] }',
                    rationale: 'Protects sensitive data and ensures compliance'
                  },
                  {
                    scenario: 'Input Validation',
                    example: '{ action: "add", category: "security", constraint_text: "All user inputs must be validated and sanitized before processing", priority: "critical", layer: "presentation", tags: ["validation", "injection-prevention"] }',
                    rationale: 'Prevents injection attacks (SQL, XSS, etc.)'
                  }
                ]
              }
            },
            workflows: {
              constraint_validation: {
                description: 'Workflow for validating code against constraints',
                steps: [
                  {
                    step: 1,
                    action: 'Retrieve active constraints for layer',
                    example: '{ action: "get", layer: "business", active_only: true }'
                  },
                  {
                    step: 2,
                    action: 'Check code changes against constraints',
                    example: 'Review file changes and verify compliance with each constraint'
                  },
                  {
                    step: 3,
                    action: 'Report violations',
                    example: 'Use message tool to send warnings for constraint violations'
                  },
                  {
                    step: 4,
                    action: 'Link violations to tasks',
                    example: 'Create tasks to fix violations and link to relevant constraints'
                  }
                ]
              },
              requirement_tracking: {
                description: 'Workflow for tracking requirements as constraints',
                steps: [
                  {
                    step: 1,
                    action: 'Add requirement as constraint',
                    example: '{ action: "add", category: "performance", constraint_text: "System must handle 1000 concurrent users", priority: "high", tags: ["requirement", "load"] }'
                  },
                  {
                    step: 2,
                    action: 'Link related decisions',
                    example: 'Use decision tool to record architectural decisions that address the constraint'
                  },
                  {
                    step: 3,
                    action: 'Create implementation tasks',
                    example: 'Use task tool to break down implementation and link to constraint'
                  },
                  {
                    step: 4,
                    action: 'Validate compliance',
                    example: 'Test implementation against constraint criteria'
                  }
                ]
              }
            },
            best_practices: {
              writing_constraints: [
                'Be specific and measurable (use numbers, percentages, time limits)',
                'Include rationale in tags or separate documentation',
                'Use appropriate priority (critical for must-have, high for important, medium/low for nice-to-have)',
                'Assign to correct layer (where constraint is enforced)',
                'Tag comprehensively for easy retrieval'
              ],
              managing_constraints: [
                'Review constraints regularly and deactivate outdated ones',
                'Link constraints to related decisions and tasks',
                'Use constraints for both technical and business requirements',
                'Validate code changes against active constraints',
                'Document constraint violations and remediation plans'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'stats':
        switch (params.action) {
          case 'layer_summary': result = getLayerSummary(); break;
          case 'db_stats': result = getStats(); break;
          case 'clear': result = clearOldData(params); break;
          case 'activity_log': result = getActivityLog({
            since: params.since,
            agent_names: params.agent_names,
            actions: params.actions,
            limit: params.limit,
          }); break;
          case 'flush': result = flushWAL(); break;
          case 'help': result = {
            tool: 'stats',
            description: 'View database statistics, activity logs, manage data cleanup, and WAL checkpoints',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all stats actions.',
            actions: {
              layer_summary: 'Get summary by layer. No params required',
              db_stats: 'Get database statistics. No params required',
              clear: 'Clear old data. Params: messages_older_than_hours, file_changes_older_than_days',
              activity_log: 'Get activity log (v3.0.0). Params: since (e.g., "5m", "1h", "2d"), agent_names (array or ["*"]), actions (filter by action types), limit (default: 100)',
              flush: 'Force WAL checkpoint to flush pending transactions to main database file. No params required. Uses TRUNCATE mode for complete flush. Useful before git commits to ensure database file is up-to-date.'
            },
            examples: {
              layer_summary: '{ action: "layer_summary" }',
              db_stats: '{ action: "db_stats" }',
              clear: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
              activity_log: '{ action: "activity_log", since: "1h", agent_names: ["bot1", "bot2"], limit: 50 }',
              flush: '{ action: "flush" }'
            },
            documentation: {
              workflows: 'docs/WORKFLOWS.md - Activity monitoring, automatic cleanup workflows (602 lines, ~30k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - Database health, cleanup strategies (345 lines, ~17k tokens)',
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Layer definitions for layer_summary (339 lines, ~17k tokens)',
              architecture: 'docs/ARCHITECTURE.md - Database schema, views, statistics tables'
            }
          }; break;
          case 'example': result = {
            tool: 'stats',
            description: 'Database statistics and maintenance examples',
            scenarios: {
              layer_analysis: {
                title: 'Architecture Layer Summary',
                example: {
                  request: '{ action: "layer_summary" }',
                  response_structure: '{ layer: string, decision_count: number, file_changes: number, active_constraints: number }[]',
                  use_case: 'Understand which layers have most activity and decisions'
                }
              },
              database_health: {
                title: 'Database Statistics',
                example: {
                  request: '{ action: "db_stats" }',
                  response_structure: '{ decisions: N, messages: N, file_changes: N, constraints: N, db_size_mb: N }',
                  use_case: 'Monitor database growth and table sizes'
                }
              },
              activity_monitoring: {
                title: 'Activity Log Queries',
                examples: [
                  {
                    scenario: 'Recent activity (last hour)',
                    request: '{ action: "activity_log", since: "1h", limit: 50 }',
                    explanation: 'View all agent activity in the past hour'
                  },
                  {
                    scenario: 'Specific agent activity',
                    request: '{ action: "activity_log", since: "24h", agent_names: ["backend-agent", "frontend-agent"] }',
                    explanation: 'Track what specific agents have been doing'
                  },
                  {
                    scenario: 'Filter by action type',
                    request: '{ action: "activity_log", since: "2d", actions: ["set_decision", "create_task"] }',
                    explanation: 'See only specific types of actions'
                  }
                ]
              },
              data_cleanup: {
                title: 'Maintenance and Cleanup',
                examples: [
                  {
                    scenario: 'Manual cleanup with specific retention',
                    request: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
                    explanation: 'Override config and delete old data'
                  },
                  {
                    scenario: 'Config-based automatic cleanup',
                    request: '{ action: "clear" }',
                    explanation: 'Use configured retention settings (respects weekend-aware mode)'
                  }
                ]
              },
              wal_management: {
                title: 'WAL Checkpoint (Git Workflow)',
                workflow: [
                  {
                    step: 1,
                    action: 'Make changes to context (decisions, tasks, etc.)',
                    explanation: 'SQLite WAL mode keeps changes in separate file'
                  },
                  {
                    step: 2,
                    action: 'Before git commit, flush WAL',
                    request: '{ action: "flush" }',
                    explanation: 'Merges WAL changes into main .db file'
                  },
                  {
                    step: 3,
                    action: 'Commit database file',
                    explanation: 'Database file now contains all changes for version control'
                  }
                ]
              }
            },
            best_practices: {
              monitoring: [
                'Check layer_summary regularly to identify hotspots',
                'Monitor db_stats to prevent database bloat',
                'Use activity_log for debugging multi-agent issues',
                'Set appropriate retention periods based on project needs'
              ],
              cleanup: [
                'Run periodic cleanup to manage database size',
                'Use weekend-aware mode for business hour retention',
                'Consider longer retention for important decisions',
                'Test cleanup with manual parameters before automating'
              ],
              wal_checkpoints: [
                'Always flush before git commits for clean diffs',
                'WAL mode improves concurrent access performance',
                'Checkpoint automatically happens on shutdown',
                'Manual flush ensures immediate persistence'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'config':
        switch (params.action) {
          case 'get': result = getConfig(); break;
          case 'update': result = updateConfig(params); break;
          case 'help': result = {
            tool: 'config',
            description: 'Manage auto-deletion configuration (weekend-aware retention)',
            note: '💡 TIP: Use action: "example" to see comprehensive usage scenarios and real-world examples for all config actions.',
            actions: {
              get: 'Get current config. No params required',
              update: 'Update config. Params: ignoreWeekend, messageRetentionHours (1-168), fileHistoryRetentionDays (1-90)'
            },
            examples: {
              get: '{ action: "get" }',
              update: '{ action: "update", ignoreWeekend: true, messageRetentionHours: 48 }'
            },
            documentation: {
              shared_concepts: 'docs/SHARED_CONCEPTS.md - Weekend-aware retention behavior explained (339 lines, ~17k tokens)',
              best_practices: 'docs/BEST_PRACTICES.md - Retention strategies, cleanup timing (345 lines, ~17k tokens)',
              architecture: 'docs/ARCHITECTURE.md - Auto-cleanup architecture, configuration system'
            }
          }; break;
          case 'example': result = {
            tool: 'config',
            description: 'Configuration management examples',
            scenarios: {
              view_config: {
                title: 'Current Configuration',
                example: {
                  request: '{ action: "get" }',
                  response: '{ ignoreWeekend: boolean, messageRetentionHours: number, fileHistoryRetentionDays: number }',
                  explanation: 'View current auto-deletion settings'
                }
              },
              standard_retention: {
                title: 'Standard Time-Based Retention',
                example: {
                  request: '{ action: "update", ignoreWeekend: false, messageRetentionHours: 24, fileHistoryRetentionDays: 7 }',
                  explanation: 'Messages deleted after 24 hours, file history after 7 days (strict time-based)'
                }
              },
              weekend_aware: {
                title: 'Weekend-Aware Retention',
                example: {
                  request: '{ action: "update", ignoreWeekend: true, messageRetentionHours: 24, fileHistoryRetentionDays: 7 }',
                  explanation: 'On Monday, 24h retention = Friday (skips weekend)',
                  scenario: 'Useful for business-hour contexts where weekend messages should persist'
                }
              },
              extended_retention: {
                title: 'Long-Term Project Retention',
                example: {
                  request: '{ action: "update", messageRetentionHours: 168, fileHistoryRetentionDays: 90 }',
                  explanation: '1 week message retention, 90 days file history (max allowed)',
                  use_case: 'Long-running projects needing extended context'
                }
              }
            },
            retention_behavior: {
              ignoreWeekend_false: {
                description: 'Standard time-based retention',
                examples: [
                  '24h on Monday = 24 hours ago (Sunday)',
                  '24h on Friday = 24 hours ago (Thursday)',
                  'Straightforward chronological deletion'
                ]
              },
              ignoreWeekend_true: {
                description: 'Business-hours retention (skips Sat/Sun)',
                examples: [
                  '24h on Monday = Friday (skips Sat/Sun)',
                  '24h on Tuesday = Monday',
                  '24h on Friday = Thursday',
                  '24h on Saturday/Sunday = Friday',
                  'Preserves weekend messages until Monday cleanup'
                ]
              }
            },
            best_practices: {
              choosing_retention: [
                'Short projects: 24h messages, 7d file history',
                'Medium projects: 72h messages, 14d file history',
                'Long projects: 168h (1 week) messages, 30-90d file history',
                'Use ignoreWeekend=true for business-hour focused work'
              ],
              limits: [
                'messageRetentionHours: 1-168 (1 hour to 1 week)',
                'fileHistoryRetentionDays: 1-90',
                'Choose based on your projects needs and database size constraints'
              ],
              cli_override: [
                'Can override config at server startup via CLI args',
                '--autodelete-ignore-weekend, --autodelete-message-hours, --autodelete-file-history-days',
                'Runtime updates via config tool take precedence over CLI'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'task':
        switch (params.action) {
          case 'create': result = createTask(params); break;
          case 'update': result = updateTask(params); break;
          case 'get': result = getTask(params); break;
          case 'list': result = listTasks(params); break;
          case 'move': result = moveTask(params); break;
          case 'link': result = linkTask(params); break;
          case 'archive': result = archiveTask(params); break;
          case 'batch_create': result = batchCreateTasks({ tasks: params.tasks, atomic: params.atomic }); break;
          case 'add_dependency': result = addDependency(params); break;
          case 'remove_dependency': result = removeDependency(params); break;
          case 'get_dependencies': result = getDependencies(params); break;
          case 'help': result = taskHelp(); break;
          case 'example': result = {
            tool: 'task',
            description: 'Comprehensive task management examples for Kanban-style workflow',
            scenarios: {
              basic_task_management: {
                title: 'Creating and Managing Tasks',
                examples: [
                  {
                    scenario: 'Create a new task',
                    request: '{ action: "create", title: "Implement user authentication", description: "Add JWT-based auth to API", priority: 3, assigned_agent: "backend-agent", layer: "business", tags: ["authentication", "security"] }',
                    explanation: 'Creates task in todo status with high priority'
                  },
                  {
                    scenario: 'Get task details',
                    request: '{ action: "get", task_id: 5 }',
                    response: 'Full task details including metadata, links, and timestamps'
                  },
                  {
                    scenario: 'List tasks by status',
                    request: '{ action: "list", status: "in_progress", limit: 20 }',
                    explanation: 'View all in-progress tasks'
                  }
                ]
              },
              status_workflow: {
                title: 'Task Lifecycle (Status Transitions)',
                workflow: [
                  {
                    step: 1,
                    status: 'todo',
                    action: '{ action: "create", title: "...", status: "todo" }',
                    description: 'Task created and waiting to be started'
                  },
                  {
                    step: 2,
                    status: 'in_progress',
                    action: '{ action: "move", task_id: 1, new_status: "in_progress" }',
                    description: 'Agent starts working on task'
                  },
                  {
                    step: 3,
                    status: 'waiting_review',
                    action: '{ action: "move", task_id: 1, new_status: "waiting_review" }',
                    description: 'Work complete, awaiting review/approval'
                  },
                  {
                    step: 4,
                    status: 'done',
                    action: '{ action: "move", task_id: 1, new_status: "done" }',
                    description: 'Task reviewed and completed'
                  },
                  {
                    step: 5,
                    status: 'archived',
                    action: '{ action: "archive", task_id: 1 }',
                    description: 'Task archived for historical record'
                  }
                ],
                blocked_status: {
                  description: 'Use "blocked" when task cannot proceed due to dependencies',
                  example: '{ action: "move", task_id: 1, new_status: "blocked" }'
                }
              },
              auto_stale_detection: {
                title: 'Automatic Stale Task Management',
                behavior: [
                  {
                    rule: 'in_progress > 2 hours → waiting_review',
                    explanation: 'Tasks stuck in progress auto-move to waiting_review',
                    rationale: 'Prevents tasks from being forgotten while in progress'
                  },
                  {
                    rule: 'waiting_review > 24 hours → todo',
                    explanation: 'Unreviewed tasks return to todo queue',
                    rationale: 'Ensures waiting tasks dont accumulate indefinitely'
                  }
                ],
                configuration: {
                  keys: ['task_stale_hours_in_progress', 'task_stale_hours_waiting_review', 'task_auto_stale_enabled'],
                  note: 'Configure via config table in database'
                }
              },
              task_linking: {
                title: 'Linking Tasks to Context',
                examples: [
                  {
                    scenario: 'Link task to decision',
                    request: '{ action: "link", task_id: 5, link_type: "decision", target_id: "api_auth_method", link_relation: "implements" }',
                    explanation: 'Track which tasks implement specific decisions'
                  },
                  {
                    scenario: 'Link task to constraint',
                    request: '{ action: "link", task_id: 5, link_type: "constraint", target_id: 3, link_relation: "addresses" }',
                    explanation: 'Show task addresses a performance/architecture/security constraint'
                  },
                  {
                    scenario: 'Link task to file',
                    request: '{ action: "link", task_id: 5, link_type: "file", target_id: "src/api/auth.ts", link_relation: "modifies" }',
                    explanation: 'Indicate which files the task will modify'
                  }
                ]
              },
              batch_operations: {
                title: 'Batch Task Creation',
                examples: [
                  {
                    scenario: 'Create multiple related tasks',
                    request: '{ action: "batch_create", tasks: [{"title": "Design API", "priority": 3}, {"title": "Implement API", "priority": 3}, {"title": "Write tests", "priority": 2}], atomic: false }',
                    explanation: 'Create task breakdown - use atomic:false for best-effort'
                  }
                ]
              },
              filtering_queries: {
                title: 'Advanced Task Queries',
                examples: [
                  {
                    scenario: 'Find high-priority tasks for agent',
                    request: '{ action: "list", assigned_agent: "backend-agent", priority: 3, status: "todo" }',
                    note: 'Priority is numeric: 1=low, 2=medium, 3=high, 4=critical'
                  },
                  {
                    scenario: 'Get all security-related tasks',
                    request: '{ action: "list", tags: ["security"], limit: 50 }',
                    explanation: 'Filter by tags for topic-based views'
                  },
                  {
                    scenario: 'View infrastructure layer tasks',
                    request: '{ action: "list", layer: "infrastructure" }',
                    explanation: 'See all DevOps/config related tasks'
                  }
                ]
              }
            },
            valid_transitions: {
              from_todo: ['in_progress', 'blocked', 'done', 'archived'],
              from_in_progress: ['waiting_review', 'blocked', 'todo'],
              from_waiting_review: ['done', 'in_progress', 'todo'],
              from_blocked: ['todo', 'in_progress'],
              from_done: ['archived', 'todo'],
              from_archived: []
            },
            best_practices: {
              task_creation: [
                'Use descriptive titles (200 char max)',
                'Set appropriate priority: 1=low, 2=medium (default), 3=high, 4=critical',
                'Assign to layer where work will be done',
                'Tag comprehensively for easy filtering',
                'Include acceptance_criteria for complex tasks'
              ],
              status_management: [
                'Move to in_progress when starting work',
                'Use waiting_review for completed but unverified work',
                'Set to blocked with notes explaining dependency',
                'Archive done tasks periodically for cleaner views'
              ],
              linking: [
                'Link tasks to decisions they implement',
                'Link to constraints they address',
                'Link to files they will modify',
                'Use descriptive link_relation values'
              ],
              coordination: [
                'Use assigned_agent for clear ownership',
                'Filter by status for Kanban board views',
                'Monitor auto-stale transitions for stuck work',
                'Use tags for cross-cutting concerns (security, performance, etc.)'
              ]
            }
          }; break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('\n✓ Shutting down MCP server...');
  try {
    const watcher = FileWatcher.getInstance();
    await watcher.stop();
  } catch (error) {
    // Ignore watcher errors during shutdown
  }
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n✓ Shutting down MCP server...');
  try {
    const watcher = FileWatcher.getInstance();
    await watcher.stop();
  } catch (error) {
    // Ignore watcher errors during shutdown
  }
  closeDatabase();
  process.exit(0);
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✓ MCP Shared Context Server running on stdio');

  // Start file watcher for auto-task-tracking
  try {
    const watcher = FileWatcher.getInstance();
    await watcher.start();
  } catch (error) {
    console.error('⚠ Failed to start file watcher:', error);
    console.error('  (Auto task tracking will be disabled)');
  }
}

main().catch((error) => {
  console.error('✗ Fatal error:', error);
  closeDatabase();
  process.exit(1);
});
