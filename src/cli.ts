#!/usr/bin/env node
/**
 * CLI for sqlew - Standalone query commands for mcp-sqlew
 * Provides quick terminal access to decisions, messages, and files
 */

import { initializeDatabase } from './database.js';
import { getContext, searchAdvanced } from './tools/context/index.js';
import { getFileChanges } from './tools/files/index.js';
import { dbDumpCommand } from './cli/db-dump.js';
import { dbExportCommand } from './cli/db-export.js';
import { dbImportCommand } from './cli/db-import.js';
// Claude Code Hooks commands
import { suggestCommand } from './cli/hooks/suggest.js';
import { trackPlanCommand } from './cli/hooks/track-plan.js';
import { saveCommand } from './cli/hooks/save.js';
import { checkCompletionCommand } from './cli/hooks/check-completion.js';
import { markDoneCommand } from './cli/hooks/mark-done.js';
import { initHooksCommand } from './cli/hooks/init-hooks.js';
import { initializeSkills, initializeRules, initializeGitignore } from './init-skills.js';
import { onSubagentStopCommand } from './cli/hooks/on-subagent-stop.js';
import { onStopCommand } from './cli/hooks/on-stop.js';
import { onEnterPlanCommand } from './cli/hooks/on-enter-plan.js';
import { onExitPlanCommand } from './cli/hooks/on-exit-plan.js';
import { installSaasCommand, showInstallSaasHelp } from './cli/install-saas.js';
import type {
  GetContextParams,
  SearchAdvancedParams,
  GetFileChangesParams,
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
  init?: boolean;
  'install-saas'?: boolean;
  force?: boolean;
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
      } else if (key === 'init') {
        parsed.init = true;
      } else if (key === 'install-saas') {
        parsed['install-saas'] = true;
      } else if (key === 'force') {
        parsed.force = true;
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
sqlew CLI - Query and database migration tool for mcp-sqlew

USAGE:
  sqlew <command> [options]
  sqlew --init              # One-shot project setup (recommended)

COMMANDS:
  Setup:
    --init           One-shot initialization (Skills + CLAUDE.md + Hooks + gitignore)
    --install-saas   Install SaaS connector plugin (requires API key)
    init --hooks     Initialize Claude Code and Git hooks only

  Database:
    db:dump    Generate SQL dump for database migration (schema + data)
    db:export  Export project data to JSON format (data-only, for append-import)
    db:import  Import project data from JSON export (append to existing database)

  Claude Code Hooks (v4.1.0+):
    suggest          Find related decisions (PreToolUse hook for Task)
    track-plan       Track plan files (PreToolUse hook for Write)
    save             Save decisions on code edit (PostToolUse hook for Edit|Write)
    check-completion Check task completion (PostToolUse hook for TodoWrite)
    mark-done        Mark decisions as implemented (Git hooks or manual)

  Plan Mode Hooks (v4.2.0+):
    on-enter-plan    Inject TOML template (PostToolUse hook for EnterPlanMode)
    on-exit-plan     Prompt TOML documentation (PostToolUse hook for ExitPlanMode)
    on-subagent-stop Process Plan agent completion (SubagentStop hook)
    on-stop          Process main agent stop (Stop hook)

OPTIONS:
  --init                   Initialize all sqlew integrations
  --help                   Show this help message

EXAMPLES:
  # Full project setup (Skills, CLAUDE.md, Hooks, gitignore)
  sqlew --init

  # Initialize only hooks
  sqlew init --hooks

  # Generate MySQL dump for database migration
  npm run db:dump -- mysql -o dump-mysql.sql

For more information on commands, run:
  npm run db:dump -- --help
  npm run db:export -- --help
  npm run db:import -- --help
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
 * @deprecated Messaging system removed in v3.8.0
 */
async function queryMessages(args: CLIArgs): Promise<void> {
  console.error('Error: The messaging system has been removed in v3.8.0.');
  console.error('The "messages" query command is no longer available.');
  process.exit(1);
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

// ============================================================================
// Initialization Commands
// ============================================================================

/**
 * Comprehensive project initialization
 * Sets up Skills, CLAUDE.md integration, Hooks, and gitignore in one command
 */
async function initAllCommand(): Promise<void> {
  const { determineProjectRoot } = await import('./utils/project-root.js');
  const projectPath = determineProjectRoot();

  console.log('[sqlew --init] Starting comprehensive initialization...');
  console.log(`[sqlew --init] Project root: ${projectPath}`);
  console.log('');

  // 1. Initialize Skills
  console.log('[1/4] Initializing Skills...');
  try {
    initializeSkills(projectPath);
    console.log('      ✓ Skills initialized');
  } catch (error) {
    console.log(`      ✗ Skills failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 2. Initialize .claude/rules/
  console.log('[2/4] Setting up .claude/rules/...');
  try {
    initializeRules(projectPath);
    console.log('      ✓ Plan mode integration rule installed');
  } catch (error) {
    console.log(`      ✗ Rules setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 3. Initialize Hooks
  console.log('[3/4] Setting up Claude Code Hooks...');
  try {
    await initHooksCommand([]);
  } catch (error) {
    console.log(`      ✗ Hooks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. Initialize gitignore
  console.log('[4/4] Updating .gitignore...');
  try {
    initializeGitignore(projectPath);
    console.log('      ✓ .gitignore updated');
  } catch (error) {
    console.log(`      ✗ .gitignore failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('');
  console.log('[sqlew --init] Initialization complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart Claude Code for hooks to take effect');
  console.log('  2. Run "/sqlew" to start using sqlew context management');
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run CLI with provided arguments
 * This function is exported for use by index.ts (unified entry point)
 * @param rawArgs - Command line arguments (without 'node' and script path)
 */
export async function runCli(rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);

  // Special handling for db:dump command (passes through --help to subcommand)
  if (args.command === 'db:dump') {
    await dbDumpCommand(rawArgs.slice(1));
    return;
  }

  // Special handling for db:export command (passes through --help to subcommand)
  if (args.command === 'db:export') {
    await dbExportCommand(rawArgs.slice(1));
    return;
  }

  // Special handling for db:import command (passes through --help to subcommand)
  if (args.command === 'db:import') {
    await dbImportCommand(rawArgs.slice(1));
    return;
  }

  // Claude Code Hooks commands (v4.1.0+)
  if (args.command === 'suggest') {
    await suggestCommand();
    return;
  }

  if (args.command === 'track-plan') {
    await trackPlanCommand();
    return;
  }

  if (args.command === 'save') {
    await saveCommand();
    return;
  }

  if (args.command === 'check-completion') {
    await checkCompletionCommand();
    return;
  }

  if (args.command === 'mark-done') {
    await markDoneCommand(rawArgs.slice(1));
    return;
  }

  // SubagentStop hook (v4.2.0+)
  if (args.command === 'on-subagent-stop') {
    await onSubagentStopCommand();
    return;
  }

  // Stop hook (v4.2.0+)
  if (args.command === 'on-stop') {
    await onStopCommand();
    return;
  }

  // EnterPlanMode hook (v4.2.0+)
  if (args.command === 'on-enter-plan') {
    await onEnterPlanCommand();
    return;
  }

  // ExitPlanMode hook (v4.2.0+)
  if (args.command === 'on-exit-plan') {
    await onExitPlanCommand();
    return;
  }

  // --init flag: comprehensive initialization (Skills + CLAUDE.md + Hooks + gitignore)
  if (args.init) {
    await initAllCommand();
    return;
  }

  // --install-saas flag: install SaaS connector plugin
  if (args['install-saas']) {
    await installSaasCommand(rawArgs);
    return;
  }

  // init --hooks command (hooks only)
  if (args.command === 'init' && rawArgs.includes('--hooks')) {
    await initHooksCommand(rawArgs.slice(1));
    return;
  }

  // Show help if requested or no command
  if (args.help || !args.command) {
    showHelp();
    process.exit(0);
  }

  try {
    // Route to appropriate command
    if (args.command === 'query') {
      // Initialize database for query commands
      const dbPath = args['db-path'];
      const config = dbPath ? { configPath: dbPath } : undefined;
      await initializeDatabase(config);

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

/**
 * Check if a command is a CLI command (for use by index.ts)
 */
export function isCliCommand(command: string): boolean {
  const cliCommands = [
    'db:dump', 'db:export', 'db:import', 'query',
    // Claude Code Hooks commands (v4.1.0+)
    'suggest', 'track-plan', 'save', 'check-completion', 'mark-done', 'init',
    // New hook events (v4.2.0+)
    'on-subagent-stop', 'on-stop', 'on-enter-plan', 'on-exit-plan',
  ];
  return cliCommands.includes(command);
}

// Run CLI when executed directly
// Check if this module is the main entry point
const isDirectExecution = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectExecution) {
  runCli(process.argv.slice(2));
}
