/**
 * MCP Server - CLI Argument Parser
 * Handles command-line argument parsing and configuration
 */

export interface ParsedArgs {
  configPath?: string;
  dbPath?: string;
  projectName?: string;
  autodeleteIgnoreWeekend?: boolean;
  autodeleteMessageHours?: number;
  autodeleteFileHistoryDays?: number;
  debugLogPath?: string;
}

/**
 * Parse command-line arguments into structured configuration
 *
 * Supported arguments:
 * - --config=<path> or --config <path>
 * - --db-path=<path> or --db-path <path>
 * - --config-path=<path> or --config-path <path>
 * - --project-name=<name> or --project-name <name>
 * - --autodelete-ignore-weekend (boolean flag)
 * - --autodelete-ignore-weekend=<true|false|1|0>
 * - --autodelete-message-hours=<number> or --autodelete-message-hours <number>
 * - --autodelete-file-history-days=<number> or --autodelete-file-history-days <number>
 * - --debug-log=<path> or --debug-log <path>
 *
 * Backward compatibility: First non-flag argument is treated as dbPath
 */
export function parseArgs(args: string[]): ParsedArgs {
  const parsedArgs: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--config=')) {
      parsedArgs.configPath = arg.split('=')[1];
    } else if (arg === '--config' && i + 1 < args.length) {
      parsedArgs.configPath = args[++i];
    } else if (arg.startsWith('--db-path=')) {
      parsedArgs.dbPath = arg.split('=')[1];
    } else if (arg === '--db-path' && i + 1 < args.length) {
      parsedArgs.dbPath = args[++i];
    } else if (arg.startsWith('--config-path=')) {
      parsedArgs.configPath = arg.split('=')[1];
    } else if (arg === '--config-path' && i + 1 < args.length) {
      parsedArgs.configPath = args[++i];
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
    } else if (arg.startsWith('--debug-log=')) {
      parsedArgs.debugLogPath = arg.split('=')[1];
    } else if (arg === '--debug-log' && i + 1 < args.length) {
      parsedArgs.debugLogPath = args[++i];
    } else if (arg.startsWith('--project-name=')) {
      parsedArgs.projectName = arg.split('=')[1];
    } else if (arg === '--project-name' && i + 1 < args.length) {
      parsedArgs.projectName = args[++i];
    } else if (!arg.startsWith('--')) {
      // Backward compatibility: first non-flag argument is dbPath
      if (!parsedArgs.dbPath) {
        parsedArgs.dbPath = arg;
      }
    }
  }

  return parsedArgs;
}

/**
 * Generate help text for CLI usage
 */
export function generateHelpText(): string {
  return `
MCP Shared Context Server - Usage

Command-line arguments:
  --config=<path>                       Path to config.toml file
  --db-path=<path>                      Path to SQLite database file
  --project-name=<name>                 Project name (overrides auto-detection)
  --autodelete-ignore-weekend           Enable weekend-aware auto-deletion
  --autodelete-message-hours=<number>   Message retention hours (default: 48)
  --autodelete-file-history-days=<num>  File history retention days (default: 10)
  --debug-log=<path>                    Path to debug log file

Examples:
  node dist/index.js --db-path=./custom.db
  node dist/index.js --autodelete-ignore-weekend
  node dist/index.js --debug-log=./logs/debug.log

See CLAUDE.md for detailed documentation.
`.trim();
}

/**
 * Validate parsed arguments
 * Throws Error if invalid configuration is detected
 */
export function validateArgs(parsedArgs: ParsedArgs): void {
  // Validate numeric arguments
  if (parsedArgs.autodeleteMessageHours !== undefined) {
    if (isNaN(parsedArgs.autodeleteMessageHours) || parsedArgs.autodeleteMessageHours < 0) {
      throw new Error('--autodelete-message-hours must be a non-negative number');
    }
  }

  if (parsedArgs.autodeleteFileHistoryDays !== undefined) {
    if (isNaN(parsedArgs.autodeleteFileHistoryDays) || parsedArgs.autodeleteFileHistoryDays < 0) {
      throw new Error('--autodelete-file-history-days must be a non-negative number');
    }
  }

  // Validate paths (basic check - they will be validated during initialization)
  if (parsedArgs.dbPath !== undefined && parsedArgs.dbPath.trim() === '') {
    throw new Error('--db-path cannot be empty');
  }

  if (parsedArgs.configPath !== undefined && parsedArgs.configPath.trim() === '') {
    throw new Error('--config-path cannot be empty');
  }

  if (parsedArgs.debugLogPath !== undefined && parsedArgs.debugLogPath.trim() === '') {
    throw new Error('--debug-log cannot be empty');
  }

  if (parsedArgs.projectName !== undefined && parsedArgs.projectName.trim() === '') {
    throw new Error('--project-name cannot be empty');
  }
}
