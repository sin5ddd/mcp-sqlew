/**
 * Centralized error handling module for MCP Sqlew server
 * Provides consistent error logging, reporting, and recovery
 */

import { debugLog, debugLogError } from './debug-logger.js';

/**
 * Safe console error wrapper that prevents EPIPE errors from crashing the error handler
 * When the pipe to Claude Code is broken, console.error throws EPIPE
 * This wrapper silently fails instead of creating cascading errors
 */
export function safeConsoleError(...args: any[]): void {
  try {
    // Check if stderr is writable before attempting to write
    if (process.stderr && process.stderr.writable) {
      console.error(...args);
    }
  } catch (error) {
    // Silently ignore EPIPE and other write errors
    // The debug logger will still capture the original error
  }
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
 */
export function handleToolError(
  toolName: string,
  action: string,
  error: any,
  params?: any
): { message: string; stack?: string } {
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

  return { message, stack };
}

/**
 * Handle initialization errors
 * Logs the error and returns formatted error message
 */
export function handleInitializationError(error: any): string {
  const { message, stack, errorType } = formatErrorDetails(error);

  debugLogError('INITIALIZATION_ERROR', error, {
    errorType: errorType,
    stack: stack
  });

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
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const { message, stack, errorType } = formatErrorDetails(error);

    safeConsoleError('\n❌ UNCAUGHT EXCEPTION (server continuing):');
    safeConsoleError(`   Message: ${message}`);
    safeConsoleError(`   Stack trace:`);
    safeConsoleError(stack?.split('\n').map(line => `     ${line}`).join('\n'));

    debugLogError('UNCAUGHT_EXCEPTION', error, {
      errorType: errorType,
      stack: stack
    });

    safeConsoleError('   ⚠️  Server continuing despite error\n');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const { message, stack, errorType } = formatErrorDetails(reason);

    safeConsoleError('\n❌ UNHANDLED PROMISE REJECTION (server continuing):');
    safeConsoleError(`   Reason: ${message}`);
    if (stack) {
      safeConsoleError(`   Stack trace:`);
      safeConsoleError(stack.split('\n').map(line => `     ${line}`).join('\n'));
    }

    debugLogError('UNHANDLED_REJECTION', reason, {
      errorType: errorType,
      stack: stack,
      promise: String(promise)
    });

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
