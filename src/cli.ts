#!/usr/bin/env node
/**
 * CLI for sqlew - Standalone query commands for mcp-sqlew
 * Provides quick terminal access to decisions, messages, files, and activity logs
 */

import { initializeDatabase } from './database.js';
import { getContext, searchAdvanced } from './tools/context.js';
import { getMessages } from './tools/messaging.js';
import { getFileChanges } from './tools/files.js';
import { getActivityLog } from './tools/utils.js';
import type {
  GetContextParams,
  SearchAdvancedParams,
  GetMessagesParams,
  GetFileChangesParams,
  GetActivityLogParams,
} from './types.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface CLIArgs {
  command?: string;
  subcommand?: string;
  layer?: string;
  tags?: string;
  since?: string;
  unread?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  output?: 'json' | 'table';
  agent?: string;
  actions?: string;
  limit?: number;
  'db-path'?: string;
  help?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse command-line arguments into structured object
 */
function parseArgs(args: string[]): CLIArgs {
  const parsed: CLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];

      if (key === 'unread') {
        parsed.unread = true;
      } else if (key === 'help') {
        parsed.help = true;
      } else if (value && !value.startsWith('--')) {
        // Handle different key types
        if (key === 'limit') {
          parsed[key] = parseInt(value, 10);
        } else if (key === 'db-path') {
          parsed['db-path'] = value;
        } else {
          (parsed as any)[key] = value;
        }
        i++; // Skip the value in next iteration
      }
    } else if (!parsed.command) {
      parsed.command = arg;
    } else if (!parsed.subcommand) {
      parsed.subcommand = arg;
    }
  }

  return parsed;
}

/**
 * Format output as JSON
 */
function formatJSON(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Format output as ASCII table
 */
function formatTable(data: any[], headers: string[]): void {
  if (data.length === 0) {
    console.log('No results found.');
    return;
  }

  // Calculate column widths
  const widths: number[] = headers.map(h => h.length);

  data.forEach(row => {
    headers.forEach((header, i) => {
      const value = String(row[header] || '');
      widths[i] = Math.max(widths[i], Math.min(value.length, 50));
    });
  });

  // Print header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  console.log(headerRow);
  console.log(headers.map((_, i) => '-'.repeat(widths[i])).join('-+-'));

  // Print rows
  data.forEach(row => {
    const rowStr = headers.map((header, i) => {
      let value = String(row[header] || '');
      if (value.length > 50) {
        value = value.slice(0, 47) + '...';
      }
      return value.padEnd(widths[i]);
    }).join(' | ');
    console.log(rowStr);
  });

  console.log(`\nTotal: ${data.length} result(s)`);
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
sqlew CLI - Query tool for mcp-sqlew v2.1.1

USAGE:
  sqlew query <subcommand> [options]

SUBCOMMANDS:
  decisions  Query decisions with filtering
  messages   Query agent messages
  files      Query file changes
  activity   Query activity log

OPTIONS:
  --layer <layer>          Filter by layer (presentation, business, data, infrastructure, cross-cutting)
  --tags <tags>            Filter by tags (comma-separated)
  --since <time>           Time filter (e.g., "5m", "1h", "2d", or ISO timestamp)
  --unread                 Show only unread messages (messages only)
  --priority <priority>    Filter by priority (low, medium, high, critical)
  --agent <agent>          Filter by agent name
  --actions <actions>      Filter by action types (comma-separated, activity only)
  --limit <number>         Limit number of results
  --output <format>        Output format: json or table (default: json)
  --db-path <path>         Database file path (default: .sqlew/sqlew.db)
  --help                   Show this help message

EXAMPLES:
  # Query active decisions with breaking changes
  sqlew query decisions --layer=business --tags=breaking --output=table

  # Query unread high-priority messages
  sqlew query messages --unread --priority=high --output=json

  # Query recent file changes in last hour
  sqlew query files --since=1h --output=table

  # Query recent activity from all agents
  sqlew query activity --since=5m --agent=* --output=json

  # Query activity with specific actions
  sqlew query activity --actions=decision_set,message_send --limit=20
`);
}

// ============================================================================
// Query Commands
// ============================================================================

/**
 * Query decisions command
 */
async function queryDecisions(args: CLIArgs): Promise<void> {
  const outputFormat = args.output || 'json';

  // Build query params
  const params: SearchAdvancedParams = {};

  if (args.layer) {
    params.layers = [args.layer];
  }

  if (args.tags) {
    params.tags_any = args.tags.split(',').map(t => t.trim());
  }

  if (args.since) {
    params.updated_after = args.since;
  }

  if (args.limit) {
    params.limit = args.limit;
  }

  // Execute query
  const result = await searchAdvanced(params);

  // Output results
  if (outputFormat === 'json') {
    formatJSON(result);
  } else {
    formatTable(result.decisions, ['key', 'value', 'version', 'status', 'layer', 'tags', 'updated']);
  }
}

/**
 * Query messages command
 */
async function queryMessages(args: CLIArgs): Promise<void> {
  const outputFormat = args.output || 'json';

  // Agent name is required for messages
  const agentName = args.agent || 'cli';

  // Build query params
  const params: GetMessagesParams = {
    agent_name: agentName,
  };

  if (args.unread) {
    params.unread_only = true;
  }

  if (args.priority) {
    params.priority_filter = args.priority;
  }

  if (args.limit) {
    params.limit = args.limit;
  }

  // Execute query
  const result = await getMessages(params);

  // Output results
  if (outputFormat === 'json') {
    formatJSON(result);
  } else {
    formatTable(result.messages, ['id', 'from_agent', 'msg_type', 'priority', 'timestamp', 'read']);
  }
}

/**
 * Query files command
 */
async function queryFiles(args: CLIArgs): Promise<void> {
  const outputFormat = args.output || 'json';

  // Build query params
  const params: GetFileChangesParams = {};

  if (args.since) {
    params.since = args.since;
  }

  if (args.layer) {
    params.layer = args.layer;
  }

  if (args.agent) {
    params.agent_name = args.agent;
  }

  if (args.limit) {
    params.limit = args.limit;
  }

  // Execute query
  const result = await getFileChanges(params);

  // Output results
  if (outputFormat === 'json') {
    formatJSON(result);
  } else {
    formatTable(result.changes, ['path', 'changed_by', 'change_type', 'layer', 'changed_at']);
  }
}

/**
 * Query activity command
 */
async function queryActivity(args: CLIArgs): Promise<void> {
  const outputFormat = args.output || 'json';

  // Build query params
  const params: GetActivityLogParams = {};

  if (args.since) {
    params.since = args.since;
  }

  if (args.agent) {
    // Support wildcard for all agents
    if (args.agent === '*') {
      params.agent_names = ['*'];
    } else {
      params.agent_names = args.agent.split(',').map(a => a.trim());
    }
  }

  if (args.actions) {
    params.actions = args.actions.split(',').map(a => a.trim());
  }

  if (args.limit) {
    params.limit = args.limit;
  }

  // Execute query
  const result = await getActivityLog(params);

  // Output results
  if (outputFormat === 'json') {
    formatJSON(result);
  } else {
    formatTable(result.activities, ['id', 'timestamp', 'agent', 'action', 'target', 'layer']);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Show help if requested or no command
  if (args.help || !args.command) {
    showHelp();
    process.exit(0);
  }

  try {
    // Initialize database
    const dbPath = args['db-path'];
    const config = dbPath ? { configPath: dbPath } : undefined;
    await initializeDatabase(config);

    // Route to appropriate command
    if (args.command === 'query') {
      switch (args.subcommand) {
        case 'decisions':
          await queryDecisions(args);
          break;
        case 'messages':
          await queryMessages(args);
          break;
        case 'files':
          await queryFiles(args);
          break;
        case 'activity':
          await queryActivity(args);
          break;
        default:
          console.error(`Unknown subcommand: ${args.subcommand}`);
          console.error('Run "sqlew --help" for usage information.');
          process.exit(1);
      }
    } else {
      console.error(`Unknown command: ${args.command}`);
      console.error('Run "sqlew --help" for usage information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run main function
main();
