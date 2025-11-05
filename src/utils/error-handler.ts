/**
 * Centralized error handling module for MCP Sqlew server
 * Provides consistent error logging, reporting, and recovery
 */

import { debugLog, debugLogError } from './debug-logger.js';

/**
 * Safe console error wrapper for MCP server mode
 *
 * Design: MCP servers should reserve stdin/stdout/stderr for JSON-RPC protocol only.
 * All diagnostic messages are written to debug log file instead.
 * This prevents EPIPE errors with strict JSON-RPC clients (e.g., Junie AI on Windows).
 *
 * @param args - Message arguments to log (written to debug log, NOT stderr)
 */
export function safeConsoleError(...args: any[]): void {
  // Write to debug log file instead of stderr
  // This keeps stdin/stdout/stderr clean for JSON-RPC protocol
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');

  debugLog('INFO', message);
}

/**
 * Format error details for logging and reporting
 */
function formatErrorDetails(error: any): {
  message: string;
  stack?: string;
  errorType: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const errorType = error?.constructor?.name || 'Unknown';

  return { message, stack, errorType };
}

/**
 * Handle tool execution errors
 * Logs the error with context and returns formatted error response
 *
 * IMPORTANT: Stack traces are ONLY written to logs, never returned to MCP client
 * This keeps responses token-efficient and prevents exposing internal details
 */
export function handleToolError(
  toolName: string,
  action: string,
  error: any,
  params?: any
): { message: string } {
  const { message, stack, errorType } = formatErrorDetails(error);

  // Enhanced debug logging with full error details
  debugLogError(`Tool ${toolName}.${action}`, error, {
    tool: toolName,
    action: action,
    params: params,
    errorType: errorType,
    stack: stack
  });

  // Log to stderr for immediate visibility (pipe-safe)
  safeConsoleError(`\n❌ ERROR in ${toolName}.${action}:`);
  safeConsoleError(`   Message: ${message}`);
  if (stack) {
    safeConsoleError(`   Stack trace:`);
    safeConsoleError(stack.split('\n').map(line => `     ${line}`).join('\n'));
  }
  if (params) {
    safeConsoleError(`   Params: ${JSON.stringify(params, null, 2)}`);
  }
  safeConsoleError('');

  // Only return message, stack goes to logs only
  return { message };
}

/**
 * Handle initialization errors (system-critical)
 * Logs the error at FATAL level and returns formatted error message
 */
export function handleInitializationError(error: any): string {
  const { message, stack, errorType } = formatErrorDetails(error);

  // Use FATAL level for system-critical initialization errors
  debugLogError('INITIALIZATION_ERROR', error, {
    errorType: errorType,
    stack: stack
  }, 'FATAL');

  safeConsoleError('\n❌ INITIALIZATION ERROR:');
  safeConsoleError(`   Message: ${message}`);
  if (stack) {
    safeConsoleError(`   Stack trace:`);
    safeConsoleError(stack.split('\n').map(line => `     ${line}`).join('\n'));
  }
  safeConsoleError('');

  return message;
}

/**
 * Setup global error handlers for uncaught exceptions and unhandled rejections
 * Server continues running to maintain availability
 */
export function setupGlobalErrorHandlers(
  onCleanup?: () => void
): void {
  // Handle uncaught exceptions (system-critical)
  process.on('uncaughtException', (error: Error) => {
    const { message, stack, errorType } = formatErrorDetails(error);

    safeConsoleError('\n❌ UNCAUGHT EXCEPTION (server continuing):');
    safeConsoleError(`   Message: ${message}`);
    safeConsoleError(`   Stack trace:`);
    safeConsoleError(stack?.split('\n').map(line => `     ${line}`).join('\n'));

    // Use FATAL level for uncaught exceptions
    debugLogError('UNCAUGHT_EXCEPTION', error, {
      errorType: errorType,
      stack: stack
    }, 'FATAL');

    safeConsoleError('   ⚠️  Server continuing despite error\n');
  });

  // Handle unhandled promise rejections (system-critical)
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const { message, stack, errorType } = formatErrorDetails(reason);

    safeConsoleError('\n❌ UNHANDLED PROMISE REJECTION (server continuing):');
    safeConsoleError(`   Reason: ${message}`);
    if (stack) {
      safeConsoleError(`   Stack trace:`);
      safeConsoleError(stack.split('\n').map(line => `     ${line}`).join('\n'));
    }

    // Use FATAL level for unhandled promise rejections
    debugLogError('UNHANDLED_REJECTION', reason, {
      errorType: errorType,
      stack: stack,
      promise: String(promise)
    }, 'FATAL');

    safeConsoleError('   ⚠️  Server continuing despite error\n');
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    safeConsoleError('\n✓ Shutting down MCP server...');
    if (onCleanup) {
      onCleanup();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    safeConsoleError('\n✓ Shutting down MCP server...');
    if (onCleanup) {
      onCleanup();
    }
    process.exit(0);
  });
}

/**
 * Handle validation errors
 * Returns user-friendly error message
 */
export function handleValidationError(
  toolName: string,
  action: string,
  validationMessage: string
): string {
  debugLog('WARN', `Validation error in ${toolName}.${action}`, {
    validation: validationMessage
  });

  return validationMessage;
}
