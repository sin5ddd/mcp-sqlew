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
let currentLogLevel: 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' = 'INFO';

// Log level hierarchy (higher number = more verbose)
// FATAL: System-critical errors (crashes, initialization failures)
// ERROR: Application errors (user errors, validation failures)
// WARN: Warnings (deprecated features, non-critical issues)
// INFO: Informational messages (startup, configuration)
// DEBUG: Detailed debugging information
const LOG_LEVELS = {
  'FATAL': 0,
  'ERROR': 1,
  'WARN': 2,
  'INFO': 3,
  'DEBUG': 4
};

/**
 * Check if a log level should be written
 * @param level - Level to check
 * @returns true if should log
 */
function shouldLog(level: string): boolean {
  const levelValue = LOG_LEVELS[level.toUpperCase() as keyof typeof LOG_LEVELS] || 0;
  const currentValue = LOG_LEVELS[currentLogLevel];
  return levelValue <= currentValue;
}

/**
 * Initialize debug logger
 * @param debugLogPath - Log path (already resolved with priority: CLI > env > config)
 * @param logLevel - Log level (case-insensitive: "error", "warn", "info", "debug")
 */
export function initDebugLogger(debugLogPath?: string, logLevel?: string): void {
  if (!debugLogPath) {
    return;
  }

  currentLogPath = debugLogPath;

  // Set log level (case-insensitive, default to INFO)
  if (logLevel) {
    const upperLevel = logLevel.toUpperCase() as 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
    if (LOG_LEVELS[upperLevel]) {
      currentLogLevel = upperLevel;
    }
  }

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
    debugLog('INFO', `Log Level: ${currentLogLevel}`);
    debugLog('INFO', `Source: ${source} (${sourceDetail})`);
    debugLog('INFO', '='.repeat(80));
  } catch (error) {
    console.error(`Failed to initialize debug logger: ${error}`);
    debugEnabled = false;
  }
}

/**
 * Sanitize string to remove newlines for single-line log format
 * @param str - String to sanitize
 * @returns String with newlines replaced by spaces
 */
function sanitizeForSingleLine(str: string): string {
  return str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Write debug log entry (always single-line format)
 * @param level - Log level (FATAL, ERROR, WARN, INFO, DEBUG)
 * @param message - Log message
 * @param data - Optional data to log
 */
export function debugLog(level: 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG', message: string, data?: any): void {
  if (!debugEnabled || !debugStream) {
    return;
  }

  // Check log level filtering
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  // Sanitize message to ensure single-line format
  const sanitizedMessage = sanitizeForSingleLine(message);
  let logEntry = `[${timestamp}] [${level}] ${sanitizedMessage}`;

  try {
    if (data !== undefined) {
      const dataStr = typeof data === 'string'
        ? sanitizeForSingleLine(data)
        : sanitizeForSingleLine(JSON.stringify(data));
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
 * @param context - Error context/description
 * @param error - Error object or message
 * @param additionalContext - Additional context data
 * @param level - Log level (FATAL for system-critical, ERROR for application errors)
 */
export function debugLogError(context: string, error: any, additionalContext?: any, level: 'FATAL' | 'ERROR' = 'ERROR'): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  debugLog(level, `${context}: ${errorMessage}`, {
    stack,
    ...additionalContext
  });
}

/**
 * Close debug logger
 */
export function closeDebugLogger(): void {
  if (debugStream) {
    debugLog('INFO', 'MCP Shared Context Server Debug Log Ended');
    debugLog('INFO', '_'.repeat(80));
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

// ============================================================================
// Enhanced Debug Logging for Crash Investigation
// ============================================================================

/**
 * Log database query execution with detailed information
 */
export function debugLogQuery(context: string, sql: string, params?: any, duration?: number): void {
  if (!debugEnabled) return;

  const logData: any = {
    sql: sql.replace(/\s+/g, ' ').trim(),
    params: params || null
  };

  if (duration !== undefined) {
    logData.duration_ms = duration;
  }

  debugLog('DEBUG', `DB Query [${context}]`, logData);
}

/**
 * Log connection pool state
 */
export function debugLogPoolState(context: string, poolState: {
  numUsed?: number;
  numFree?: number;
  numPendingAcquires?: number;
  numPendingCreates?: number;
}): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `Connection Pool State [${context}]`, poolState);
}

/**
 * Log transaction boundaries
 */
export function debugLogTransaction(action: 'START' | 'COMMIT' | 'ROLLBACK', context: string, transactionId?: string): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `Transaction ${action} [${context}]`, { transaction_id: transactionId });
}

/**
 * Log parameter validation
 */
export function debugLogValidation(context: string, paramName: string, value: any, valid: boolean, errorMsg?: string): void {
  if (!debugEnabled) return;

  debugLog(
    valid ? 'DEBUG' : 'WARN',
    `Parameter Validation [${context}]`,
    {
      parameter: paramName,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      valid,
      error: errorMsg || null
    }
  );
}

/**
 * Log schema operation (insert, update, select)
 */
export function debugLogSchemaOperation(
  operation: 'INSERT' | 'UPDATE' | 'SELECT' | 'DELETE',
  table: string,
  columns?: string[],
  whereClause?: string,
  values?: any
): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `Schema Operation: ${operation} ${table}`, {
    columns: columns || null,
    where: whereClause || null,
    values: values || null
  });
}

/**
 * Log JSON parsing/serialization
 */
export function debugLogJSON(context: string, operation: 'PARSE' | 'STRINGIFY', input: any, success: boolean, error?: string): void {
  if (!debugEnabled) return;

  debugLog(
    success ? 'DEBUG' : 'ERROR',
    `JSON ${operation} [${context}]`,
    {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      success,
      error: error || null
    }
  );
}

/**
 * Log function entry with parameters
 */
export function debugLogFunctionEntry(functionName: string, params: any): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `→ Function Entry: ${functionName}`, { params });
}

/**
 * Log function exit with result
 */
export function debugLogFunctionExit(functionName: string, success: boolean, result?: any, error?: any): void {
  if (!debugEnabled) return;

  debugLog(
    success ? 'DEBUG' : 'ERROR',
    `← Function Exit: ${functionName} ${success ? 'SUCCESS' : 'FAILED'}`,
    success ? { result } : { error: error instanceof Error ? error.message : String(error) }
  );
}

/**
 * Log connection acquisition
 */
export function debugLogConnectionAcquire(context: string, waitTime?: number): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `Connection Acquired [${context}]`, { wait_time_ms: waitTime || 0 });
}

/**
 * Log connection release
 */
export function debugLogConnectionRelease(context: string, duration?: number): void {
  if (!debugEnabled) return;

  debugLog('DEBUG', `Connection Released [${context}]`, { duration_ms: duration || 0 });
}

/**
 * Log critical error with full context
 */
export function debugLogCriticalError(
  context: string,
  error: any,
  additionalContext?: {
    function?: string;
    params?: any;
    sql?: string;
    poolState?: any;
  }
): void {
  if (!debugEnabled) return;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  debugLog('ERROR', `💥 CRITICAL ERROR [${context}]`, {
    error: errorMessage,
    stack,
    ...additionalContext
  });
}
