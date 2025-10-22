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
import { setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer, quickSetDecision, searchAdvanced, setDecisionBatch, hasUpdates, setFromTemplate, createTemplate, listTemplates, hardDeleteDecision, addDecisionContextAction, listDecisionContextsAction, decisionHelp, decisionExample } from './tools/context.js';
import { sendMessage, getMessages, markRead, sendMessageBatch, messageHelp, messageExample } from './tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock, recordFileChangeBatch, fileHelp, fileExample } from './tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint, constraintHelp, constraintExample } from './tools/constraints.js';
import { getLayerSummary, clearOldData, getStats, getActivityLog, flushWAL, statsHelp, statsExample } from './tools/utils.js';
import { getConfig, updateConfig, configHelp, configExample } from './tools/config.js';
import { createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask, batchCreateTasks, addDependency, removeDependency, getDependencies, watchFiles, getPrunedFiles, linkPrunedFile, taskHelp, taskExample, watcherStatus } from './tools/tasks.js';
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
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['create', 'update', 'get', 'list', 'move', 'link', 'archive', 'batch_create', 'add_dependency', 'remove_dependency', 'get_dependencies', 'watch_files', 'watcher', 'help', 'example'] },
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
            // watch_files parameters (v3.4.1)
            watch_files: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to watch for auto-tracking' },
            file_path: { type: 'string', description: 'Single file path (for watch_files action)' },
            file_paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths (for watch_files action)' },
            // batch_create parameters
            tasks: { type: 'array', description: 'Array of tasks for batch operation (max: 50)' },
            atomic: { type: 'boolean', description: 'Atomic mode - all succeed or all fail (default: true)' },
            // dependency parameters (v3.2.0)
            blocker_task_id: { type: 'number' },
            blocked_task_id: { type: 'number' },
            include_dependencies: { type: 'boolean' },
            include_dependency_counts: { type: 'boolean' },
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
          case 'help': result = decisionHelp(); break;
          case 'example': result = decisionExample(); break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'message':
        switch (params.action) {
          case 'send': result = sendMessage(params); break;
          case 'get': result = getMessages(params); break;
          case 'mark_read': result = markRead(params); break;
          case 'send_batch': result = sendMessageBatch({ messages: params.messages, atomic: params.atomic }); break;
          case 'help': result = messageHelp(); break;
          case 'example': result = messageExample(); break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'file':
        switch (params.action) {
          case 'record': result = recordFileChange(params); break;
          case 'get': result = getFileChanges(params); break;
          case 'check_lock': result = checkFileLock(params); break;
          case 'record_batch': result = recordFileChangeBatch({ file_changes: params.file_changes, atomic: params.atomic }); break;
          case 'help': result = fileHelp(); break;
          case 'example': result = fileExample(); break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'constraint':
        switch (params.action) {
          case 'add': result = addConstraint(params); break;
          case 'get': result = getConstraints(params); break;
          case 'deactivate': result = deactivateConstraint(params); break;
          case 'help': result = constraintHelp(); break;
          case 'example': result = constraintExample(); break;
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
          case 'help': result = statsHelp(); break;
          case 'example': result = statsExample(); break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'config':
        switch (params.action) {
          case 'get': result = getConfig(); break;
          case 'update': result = updateConfig(params); break;
          case 'help': result = configHelp(); break;
          case 'example': result = configExample(); break;
          default: throw new Error(`Unknown action: ${params.action}`);
        }
        break;

      case 'task':
        switch (params.action) {
          case 'create': result = createTask(params); break;
          case 'update': result = updateTask(params); break;
          case 'get': result = getTask(params); break;
          case 'list': result = await listTasks(params); break;
          case 'move': result = moveTask(params); break;
          case 'link': result = linkTask(params); break;
          case 'archive': result = archiveTask(params); break;
          case 'batch_create': result = batchCreateTasks({ tasks: params.tasks, atomic: params.atomic }); break;
          case 'add_dependency': result = addDependency(params); break;
          case 'remove_dependency': result = removeDependency(params); break;
          case 'get_dependencies': result = getDependencies(params); break;
          case 'watch_files': result = watchFiles(params); break;
          case 'get_pruned_files': result = getPrunedFiles(params); break;
          case 'link_pruned_file': result = linkPrunedFile(params); break;
          case 'watcher': result = watcherStatus(params); break;
          case 'help': result = taskHelp(); break;
          case 'example': result = taskExample(); break;
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
