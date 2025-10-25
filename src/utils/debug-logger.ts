/**
 * Debug Logger for MCP Shared Context Server
 *
 * Enables debug logging when specified via CLI arg, environment variable, or config file.
 * Priority: CLI arg > Environment variable > Config file
 *
 * Usage:
 *   node dist/index.js --debug-log=/path/to/debug.log
 *   SQLEW_DEBUG=/path/to/debug.log node dist/index.js
 *   OR set debug.log_path in .sqlew/config.toml
 */

import * as fs from 'fs';
import * as path from 'path';

let debugEnabled = false;
let debugStream: fs.WriteStream | null = null;
let currentLogPath: string | null = null;

/**
 * Initialize debug logger
 * @param debugLogPath - Log path (already resolved with priority: CLI > env > config)
 */
export function initDebugLogger(debugLogPath?: string): void {
  if (!debugLogPath) {
    return;
  }

  currentLogPath = debugLogPath;

  try {
    // Ensure directory exists
    const logDir = path.dirname(debugLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create write stream (append mode)
    debugStream = fs.createWriteStream(debugLogPath, { flags: 'a' });
    debugEnabled = true;

    // Detect source (for logging purposes)
    const cliArg = process.argv.find(arg => arg.startsWith('--debug-log'));
    const envVar = process.env.SQLEW_DEBUG;
    const source = cliArg ? 'CLI Argument' : envVar ? 'Environment Variable' : 'Config File';
    const sourceDetail = cliArg ? '--debug-log' : envVar ? 'SQLEW_DEBUG' : 'debug.log_path';

    debugLog('INFO', '='.repeat(80));
    debugLog('INFO', `MCP Shared Context Server Debug Log Started`);
    debugLog('INFO', `Timestamp: ${new Date().toISOString()}`);
    debugLog('INFO', `Process ID: ${process.pid}`);
    debugLog('INFO', `Debug Log Path: ${debugLogPath}`);
    debugLog('INFO', `Source: ${source} (${sourceDetail})`);
    debugLog('INFO', '='.repeat(80));
  } catch (error) {
    console.error(`Failed to initialize debug logger: ${error}`);
    debugEnabled = false;
  }
}

/**
 * Write debug log entry
 * @param level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param message - Log message
 * @param data - Optional data to log
 */
export function debugLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: any): void {
  if (!debugEnabled || !debugStream) {
    return;
  }

  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] [${level}] ${message}`;

  try {
    if (data !== undefined) {
      const dataStr = typeof data === 'string'
        ? data
        : JSON.stringify(data);
      logEntry += ` | Data: ${dataStr}`;
    }

    debugStream.write(logEntry + '\n');
  } catch (error) {
    console.error(`Failed to write debug log: ${error}`);
  }
}

/**
 * Log MCP tool call
 */
export function debugLogToolCall(toolName: string, action: string, params: any): void {
  debugLog('DEBUG', `Tool Call: ${toolName}.${action}`, { params });
}

/**
 * Log MCP tool response
 */
export function debugLogToolResponse(toolName: string, action: string, success: boolean, result?: any, error?: any): void {
  debugLog(
    success ? 'DEBUG' : 'ERROR',
    `Tool Response: ${toolName}.${action} ${success ? 'SUCCESS' : 'FAILED'}`,
    success ? result : error
  );
}

/**
 * Log error with stack trace
 */
export function debugLogError(context: string, error: any): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  debugLog('ERROR', `${context}: ${errorMessage}`, { stack });
}

/**
 * Close debug logger
 */
export function closeDebugLogger(): void {
  if (debugStream) {
    debugLog('INFO', 'MCP Shared Context Server Debug Log Ended');
    debugLog('INFO', '='.repeat(80));
    debugStream.end();
    debugStream = null;
    debugEnabled = false;
  }
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}
