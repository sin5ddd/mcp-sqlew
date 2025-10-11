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
import { setDecision, getContext, getDecision, searchByTags, getVersions, searchByLayer } from './tools/context.js';
import { sendMessage, getMessages, markRead } from './tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock } from './tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint } from './tools/constraints.js';
import { getLayerSummary, clearOldData, getStats } from './tools/utils.js';
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
    version: '1.0.0',
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
        description: 'Manage decisions (actions: set, get, list, search_tags, search_layer, versions)',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action (use "help" for detailed usage)',
              enum: ['set', 'get', 'list', 'search_tags', 'search_layer', 'versions', 'help']
            },
            key: { type: 'string', description: 'Key' },
            value: { type: ['string', 'number'], description: 'Value' },
            agent: { type: 'string', description: 'Agent' },
            layer: {
              type: 'string',
              description: 'Layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            version: { type: 'string', description: 'Version' },
            status: {
              type: 'string',
              description: 'Status',
              enum: ['active', 'deprecated', 'draft'],
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
            scopes: { type: 'array', items: { type: 'string' }, description: 'Scopes' },
            scope: { type: 'string', description: 'Scope' },
            tag_match: { type: 'string', enum: ['AND', 'OR'], default: 'OR' },
            include_tags: { type: 'boolean', default: true },
          },
          required: ['action'],
        },
      },
      {
        name: 'message',
        description: 'Agent messaging (actions: send, get, mark_read)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['send', 'get', 'mark_read', 'help'] },
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
          },
          required: ['action'],
        },
      },
      {
        name: 'file',
        description: 'File change tracking (actions: record, get, check_lock)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['record', 'get', 'check_lock', 'help'] },
            file_path: { type: 'string' },
            agent_name: { type: 'string' },
            change_type: { type: 'string', enum: ['created', 'modified', 'deleted'] },
            layer: { type: 'string', enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'] },
            description: { type: 'string' },
            since: { type: 'string' },
            limit: { type: 'number' },
            lock_duration: { type: 'number' },
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
        description: 'Statistics and data cleanup (actions: layer_summary, db_stats, clear)',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Action (use "help" for usage)', enum: ['layer_summary', 'db_stats', 'clear', 'help'] },
            messages_older_than_hours: { type: 'number' },
            file_changes_older_than_days: { type: 'number' },
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
          case 'help': result = {
            tool: 'decision',
            description: 'Manage decisions with metadata (tags, layers, versions, scopes)',
            actions: {
              set: 'Set/update a decision. Params: key (required), value (required), agent, layer, version, status, tags, scopes',
              get: 'Get specific decision by key. Params: key (required)',
              list: 'List/filter decisions. Params: status, layer, tags, scope, tag_match',
              search_tags: 'Search decisions by tags. Params: tags (required), match_mode, status, layer',
              search_layer: 'Search decisions by layer. Params: layer (required), status, include_tags',
              versions: 'Get version history for a decision. Params: key (required)'
            },
            examples: {
              set: '{ action: "set", key: "auth_method", value: "jwt", tags: ["security"] }',
              get: '{ action: "get", key: "auth_method" }',
              list: '{ action: "list", status: "active", layer: "infrastructure" }',
              search_tags: '{ action: "search_tags", tags: ["security", "api"] }'
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
          case 'help': result = {
            tool: 'message',
            description: 'Send and retrieve messages between agents with priority levels',
            actions: {
              send: 'Send message. Params: from_agent (required), msg_type (required), message (required), to_agent, priority, payload',
              get: 'Get messages for agent. Params: agent_name (required), unread_only, priority_filter, msg_type_filter, limit',
              mark_read: 'Mark messages as read. Params: agent_name (required), message_ids (required)'
            },
            examples: {
              send: '{ action: "send", from_agent: "bot1", msg_type: "info", message: "Task complete", priority: "high" }',
              get: '{ action: "get", agent_name: "bot1", unread_only: true }',
              mark_read: '{ action: "mark_read", agent_name: "bot1", message_ids: [1, 2, 3] }'
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
          case 'help': result = {
            tool: 'file',
            description: 'Track file changes across agents with layer classification',
            actions: {
              record: 'Record file change. Params: file_path (required), agent_name (required), change_type (required), layer, description',
              get: 'Get file changes. Params: file_path, agent_name, layer, change_type, since, limit',
              check_lock: 'Check if file locked. Params: file_path (required), lock_duration'
            },
            examples: {
              record: '{ action: "record", file_path: "src/index.ts", agent_name: "refactor-bot", change_type: "modified", layer: "infrastructure" }',
              get: '{ action: "get", agent_name: "refactor-bot", layer: "infrastructure", limit: 10 }',
              check_lock: '{ action: "check_lock", file_path: "src/index.ts", lock_duration: 300 }'
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
          case 'help': result = {
            tool: 'stats',
            description: 'View database statistics and manage data cleanup',
            actions: {
              layer_summary: 'Get summary by layer. No params required',
              db_stats: 'Get database statistics. No params required',
              clear: 'Clear old data. Params: messages_older_than_hours, file_changes_older_than_days'
            },
            examples: {
              layer_summary: '{ action: "layer_summary" }',
              db_stats: '{ action: "db_stats" }',
              clear: '{ action: "clear", messages_older_than_hours: 48, file_changes_older_than_days: 14 }'
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
