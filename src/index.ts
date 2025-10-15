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
import { setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer, quickSetDecision, searchAdvanced, setDecisionBatch, hasUpdates, setFromTemplate, createTemplate, listTemplates } from './tools/context.js';
import { sendMessage, getMessages, markRead, sendMessageBatch } from './tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch } from './tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint } from './tools/constraints.js';
import { getLayerSummary, clearOldData, getStats, getActivityLog } from './tools/utils.js';
import { getConfig, updateConfig } from './tools/config.js';

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
    name: 'mcp-sklew',
    version: '2.1.3',
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
        description: 'Manage decisions (13 actions + help)',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action',
              enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'quick_set', 'search_advanced', 'set_batch', 'has_updates', 'set_from_template', 'create_template', 'list_templates', 'help']
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
          },
          required: ['action'],
        },
      },
      {
        name: 'message',
        description: 'Agent messaging (actions: send, get, mark_read, send_batch)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['send', 'get', 'mark_read', 'send_batch', 'help'] },
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
        description: 'File change tracking (actions: record, get, check_lock, record_batch)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['record', 'get', 'check_lock', 'record_batch', 'help'] },
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
        description: 'Constraint management (actions: add, get, deactivate)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['add', 'get', 'deactivate', 'help'] },
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
        description: 'Statistics and data cleanup (actions: layer_summary, db_stats, clear, activity_log)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['layer_summary', 'db_stats', 'clear', 'activity_log', 'help'] },
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
        description: 'Auto-deletion config (actions: get, update)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['get', 'update', 'help'] },
            ignoreWeekend: { type: 'boolean' },
            messageRetentionHours: { type: 'number', minimum: 1, maximum: 168 },
            fileHistoryRetentionDays: { type: 'number', minimum: 1, maximum: 90 },
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
          case 'help': result = {
            tool: 'decision',
            description: 'Manage decisions with metadata (tags, layers, versions, scopes)',
            actions: {
              set: 'Set/update a decision. Params: key (required), value (required), agent, layer, version, status, tags, scopes',
              get: 'Get specific decision by key. Params: key (required)',
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
              list_templates: 'List all decision templates (FR-006). No params required. Returns: {templates: [{id, name, defaults, required_fields, created_by, created_at}], count}. Shows both built-in and custom templates.'
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
              list_templates: '{ action: "list_templates" }'
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
            actions: {
              add: 'Add constraint. Params: category (required), constraint_text (required), priority, layer, tags, created_by',
              get: 'Get constraints. Params: category, layer, priority, tags, active_only, limit',
              deactivate: 'Deactivate constraint. Params: constraint_id (required)'
            },
            examples: {
              add: '{ action: "add", category: "performance", constraint_text: "API response time <100ms", priority: "high", tags: ["api"] }',
              get: '{ action: "get", category: "performance", active_only: true }',
              deactivate: '{ action: "deactivate", constraint_id: 5 }'
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
          case 'help': result = {
            tool: 'stats',
            description: 'View database statistics, activity logs, and manage data cleanup',
            actions: {
              layer_summary: 'Get summary by layer. No params required',
              db_stats: 'Get database statistics. No params required',
              clear: 'Clear old data. Params: messages_older_than_hours, file_changes_older_than_days',
              activity_log: 'Get activity log (v3.0.0). Params: since (e.g., "5m", "1h", "2d"), agent_names (array or ["*"]), actions (filter by action types), limit (default: 100)'
            },
            examples: {
              layer_summary: '{ action: "layer_summary" }',
              db_stats: '{ action: "db_stats" }',
              clear: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }',
              activity_log: '{ action: "activity_log", since: "1h", agent_names: ["bot1", "bot2"], limit: 50 }'
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
            actions: {
              get: 'Get current config. No params required',
              update: 'Update config. Params: ignoreWeekend, messageRetentionHours (1-168), fileHistoryRetentionDays (1-90)'
            },
            examples: {
              get: '{ action: "get" }',
              update: '{ action: "update", ignoreWeekend: true, messageRetentionHours: 48 }'
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
process.on('SIGINT', () => {
  console.error('\n✓ Shutting down MCP server...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n✓ Shutting down MCP server...');
  closeDatabase();
  process.exit(0);
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✓ MCP Shared Context Server running on stdio');
}

main().catch((error) => {
  console.error('✗ Fatal error:', error);
  closeDatabase();
  process.exit(1);
});
