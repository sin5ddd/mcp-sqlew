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
import type {
  SetDecisionParams,
  GetContextParams,
  GetDecisionParams,
  SearchByTagsParams,
  GetVersionsParams,
  SearchByLayerParams,
  SendMessageParams,
  GetMessagesParams,
  MarkReadParams,
  RecordFileChangeParams,
  GetFileChangesParams,
  CheckFileLockParams,
  AddConstraintParams,
  GetConstraintsParams,
  DeactivateConstraintParams,
  ClearOldDataParams
} from './types.js';

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
        name: 'set_decision',
        description: 'Set or update a decision in the shared context. Auto-detects numeric vs string values. Supports tags, layers, scopes, and version tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Unique key for the decision (e.g., "auth_method", "max_connections")',
            },
            value: {
              type: ['string', 'number'],
              description: 'Decision value (string or numeric). Numeric values are stored in optimized table.',
            },
            agent: {
              type: 'string',
              description: 'Name of the agent making the decision (defaults to "system")',
            },
            layer: {
              type: 'string',
              description: 'Architecture layer (presentation, business, data, infrastructure, cross-cutting)',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            version: {
              type: 'string',
              description: 'Version identifier (defaults to "1.0.0"). Used for change tracking.',
            },
            status: {
              type: 'string',
              description: 'Decision status (defaults to "active")',
              enum: ['active', 'deprecated', 'draft'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (e.g., ["authentication", "security"])',
            },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Module or component scopes (e.g., ["user-service", "api"])',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'get_context',
        description: 'Retrieve decisions with advanced filtering. Returns token-efficient view with all metadata. Supports filtering by status, layer, tags, and scope.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by decision status',
              enum: ['active', 'deprecated', 'draft'],
            },
            layer: {
              type: 'string',
              description: 'Filter by architecture layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (use tag_match to control AND/OR logic)',
            },
            scope: {
              type: 'string',
              description: 'Filter by specific scope/module',
            },
            tag_match: {
              type: 'string',
              description: 'Tag matching mode: "AND" (all tags required) or "OR" (any tag)',
              enum: ['AND', 'OR'],
              default: 'OR',
            },
          },
        },
      },
      {
        name: 'get_decision',
        description: 'Get a specific decision by key. Returns full metadata including tags, layer, scopes, version, and timestamp.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Decision key to retrieve',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'search_by_tags',
        description: 'Search for decisions by tags with AND/OR logic. Supports flexible tag-based filtering with optional status and layer filters.',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of tags to search for (at least one required)',
            },
            match_mode: {
              type: 'string',
              description: 'Tag matching mode: "AND" (all tags required) or "OR" (any tag)',
              enum: ['AND', 'OR'],
              default: 'OR',
            },
            status: {
              type: 'string',
              description: 'Optional filter by decision status',
              enum: ['active', 'deprecated', 'draft'],
            },
            layer: {
              type: 'string',
              description: 'Optional filter by architecture layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
          },
          required: ['tags'],
        },
      },
      {
        name: 'get_versions',
        description: 'Get version history for a specific decision key. Returns all historical versions ordered by timestamp (newest first).',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Decision key to get version history for',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'search_by_layer',
        description: 'Search for decisions within a specific architecture layer. Supports status filtering and optional tag inclusion.',
        inputSchema: {
          type: 'object',
          properties: {
            layer: {
              type: 'string',
              description: 'Architecture layer to search in',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            status: {
              type: 'string',
              description: 'Filter by decision status (defaults to "active")',
              enum: ['active', 'deprecated', 'draft'],
              default: 'active',
            },
            include_tags: {
              type: 'boolean',
              description: 'Include tag information in results (defaults to true)',
              default: true,
            },
          },
          required: ['layer'],
        },
      },
      {
        name: 'send_message',
        description: 'Send a message from one agent to another (or broadcast to all). Supports priority levels and optional JSON payload.',
        inputSchema: {
          type: 'object',
          properties: {
            from_agent: {
              type: 'string',
              description: 'Name of the sending agent',
            },
            to_agent: {
              type: ['string', 'null'],
              description: 'Name of the receiving agent (null or omit for broadcast)',
            },
            msg_type: {
              type: 'string',
              description: 'Type of message',
              enum: ['decision', 'warning', 'request', 'info'],
            },
            message: {
              type: 'string',
              description: 'The message content',
            },
            priority: {
              type: 'string',
              description: 'Message priority level (defaults to "medium")',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
            },
            payload: {
              type: 'object',
              description: 'Optional JSON payload with additional data',
            },
          },
          required: ['from_agent', 'msg_type', 'message'],
        },
      },
      {
        name: 'get_messages',
        description: 'Retrieve messages for an agent. Returns messages addressed to the agent or broadcast messages. Supports filtering by read status, priority, and message type.',
        inputSchema: {
          type: 'object',
          properties: {
            agent_name: {
              type: 'string',
              description: 'Name of the agent to retrieve messages for',
            },
            unread_only: {
              type: 'boolean',
              description: 'Only return unread messages (defaults to false)',
              default: false,
            },
            priority_filter: {
              type: 'string',
              description: 'Filter by specific priority level',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            msg_type_filter: {
              type: 'string',
              description: 'Filter by message type',
              enum: ['decision', 'warning', 'request', 'info'],
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (defaults to 50)',
              default: 50,
            },
          },
          required: ['agent_name'],
        },
      },
      {
        name: 'mark_read',
        description: 'Mark messages as read. Only marks messages addressed to the specified agent (security check). Idempotent operation.',
        inputSchema: {
          type: 'object',
          properties: {
            message_ids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of message IDs to mark as read',
            },
            agent_name: {
              type: 'string',
              description: 'Name of the agent marking messages as read',
            },
          },
          required: ['message_ids', 'agent_name'],
        },
      },
      {
        name: 'record_file_change',
        description: 'Record a file change with optional layer assignment and description. Auto-registers the file and agent. Useful for tracking file modifications across agents.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The file path (absolute or relative)',
            },
            agent_name: {
              type: 'string',
              description: 'Name of the agent making the change',
            },
            change_type: {
              type: 'string',
              description: 'Type of change made to the file',
              enum: ['created', 'modified', 'deleted'],
            },
            layer: {
              type: 'string',
              description: 'Optional architecture layer assignment',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            description: {
              type: 'string',
              description: 'Optional description of the change',
            },
          },
          required: ['file_path', 'agent_name', 'change_type'],
        },
      },
      {
        name: 'get_file_changes',
        description: 'Retrieve file changes with advanced filtering. Supports filtering by file, agent, layer, change type, and time range. Returns token-efficient view when no filters applied.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Filter by specific file path',
            },
            agent_name: {
              type: 'string',
              description: 'Filter by agent who made the change',
            },
            layer: {
              type: 'string',
              description: 'Filter by architecture layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            change_type: {
              type: 'string',
              description: 'Filter by type of change',
              enum: ['created', 'modified', 'deleted'],
            },
            since: {
              type: 'string',
              description: 'ISO 8601 timestamp - return changes since this time',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of changes to return (default: 100)',
              default: 100,
            },
          },
        },
      },
      {
        name: 'check_file_lock',
        description: 'Check if a file is "locked" (recently modified). Useful to prevent concurrent edits by multiple agents. Returns lock status with details of last change.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The file path to check',
            },
            lock_duration: {
              type: 'number',
              description: 'Time window in seconds to consider "locked" (default: 300 = 5 minutes)',
              default: 300,
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'add_constraint',
        description: 'Add a constraint with priority level, optional layer assignment, and tags. Categories: performance, architecture, security. Auto-registers category and agent.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Constraint category',
              enum: ['performance', 'architecture', 'security'],
            },
            constraint_text: {
              type: 'string',
              description: 'The constraint description/requirement',
            },
            priority: {
              type: 'string',
              description: 'Priority level (defaults to "medium")',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
            },
            layer: {
              type: 'string',
              description: 'Optional architecture layer assignment',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for categorization (e.g., ["api", "security"])',
            },
            created_by: {
              type: 'string',
              description: 'Agent creating the constraint (defaults to "system")',
            },
          },
          required: ['category', 'constraint_text'],
        },
      },
      {
        name: 'get_constraints',
        description: 'Retrieve constraints with advanced filtering. Supports filtering by category, layer, priority, tags, and active status. Uses token-efficient view with all metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by constraint category',
              enum: ['performance', 'architecture', 'security'],
            },
            layer: {
              type: 'string',
              description: 'Filter by architecture layer',
              enum: ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'],
            },
            priority: {
              type: 'string',
              description: 'Filter by priority level',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (OR logic - matches ANY tag)',
            },
            active_only: {
              type: 'boolean',
              description: 'Only return active constraints (defaults to true)',
              default: true,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of constraints to return (default: 50)',
              default: 50,
            },
          },
        },
      },
      {
        name: 'deactivate_constraint',
        description: 'Deactivate a constraint (soft delete). Idempotent - deactivating already-inactive constraint is safe. Constraints are never removed from database.',
        inputSchema: {
          type: 'object',
          properties: {
            constraint_id: {
              type: 'number',
              description: 'The constraint ID to deactivate',
            },
          },
          required: ['constraint_id'],
        },
      },
      {
        name: 'get_layer_summary',
        description: 'Get summary statistics for all architecture layers. Returns decision counts, recent file changes (last 1 hour), and active constraints per layer.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'clear_old_data',
        description: 'Manually clear old data from the database. Deletes messages older than specified hours and file changes older than specified days. Transaction-safe operation that returns counts of deleted records.',
        inputSchema: {
          type: 'object',
          properties: {
            messages_older_than_hours: {
              type: 'number',
              description: 'Delete messages older than this many hours (default: 24)',
              default: 24,
            },
            file_changes_older_than_days: {
              type: 'number',
              description: 'Delete file changes older than this many days (default: 7)',
              default: 7,
            },
          },
        },
      },
      {
        name: 'get_stats',
        description: 'Get comprehensive database statistics including counts for all major tables, active vs total records for decisions and constraints, and overall database health metrics.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_config',
        description: 'Get current auto-deletion configuration settings. Returns weekend-awareness flag, message retention hours, and file history retention days.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'update_config',
        description: 'Update auto-deletion configuration settings. All parameters are optional. Changes take effect immediately for subsequent cleanup operations.',
        inputSchema: {
          type: 'object',
          properties: {
            ignoreWeekend: {
              type: 'boolean',
              description: 'Whether to skip weekends when calculating retention periods (true = skip weekends)',
            },
            messageRetentionHours: {
              type: 'number',
              description: 'Number of hours to retain messages (1-168 hours)',
              minimum: 1,
              maximum: 168,
            },
            fileHistoryRetentionDays: {
              type: 'number',
              description: 'Number of days to retain file change history (1-90 days)',
              minimum: 1,
              maximum: 90,
            },
          },
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'set_decision': {
        const params = args as unknown as SetDecisionParams;
        const result = setDecision(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_context': {
        const params = args as unknown as GetContextParams;
        const result = getContext(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_decision': {
        const params = args as unknown as GetDecisionParams;
        const result = getDecision(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'search_by_tags': {
        const params = args as unknown as SearchByTagsParams;
        const result = searchByTags(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_versions': {
        const params = args as unknown as GetVersionsParams;
        const result = getVersions(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'search_by_layer': {
        const params = args as unknown as SearchByLayerParams;
        const result = searchByLayer(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'send_message': {
        const params = args as unknown as any;
        const result = sendMessage(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_messages': {
        const params = args as unknown as any;
        const result = getMessages(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'mark_read': {
        const params = args as unknown as MarkReadParams;
        const result = markRead(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'record_file_change': {
        const params = args as unknown as RecordFileChangeParams;
        const result = recordFileChange(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_file_changes': {
        const params = args as unknown as GetFileChangesParams;
        const result = getFileChanges(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'check_file_lock': {
        const params = args as unknown as CheckFileLockParams;
        const result = checkFileLock(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'add_constraint': {
        const params = args as unknown as AddConstraintParams;
        const result = addConstraint(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_constraints': {
        const params = args as unknown as GetConstraintsParams;
        const result = getConstraints(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'deactivate_constraint': {
        const params = args as unknown as DeactivateConstraintParams;
        const result = deactivateConstraint(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_layer_summary': {
        const result = getLayerSummary();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'clear_old_data': {
        const params = args as unknown as ClearOldDataParams;
        const result = clearOldData(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_stats': {
        const result = getStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_config': {
        const result = getConfig();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'update_config': {
        const params = args as unknown as {
          ignoreWeekend?: boolean;
          messageRetentionHours?: number;
          fileHistoryRetentionDays?: number;
        };
        const result = updateConfig(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
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
