/**
 * Centralized error handling module for MCP Sqlew server
 * Provides consistent error logging, reporting, and recovery
 */

import { debugLog, debugLogError } from './debug-logger.js';

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

  // Log to stderr for immediate visibility
  console.error(`\n❌ ERROR in ${toolName}.${action}:`);
  console.error(`   Message: ${message}`);
  if (stack) {
    console.error(`   Stack trace:`);
    console.error(stack.split('\n').map(line => `     ${line}`).join('\n'));
  }
  if (params) {
    console.error(`   Params: ${JSON.stringify(params, null, 2)}`);
  }
  console.error('');

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

  console.error('\n❌ INITIALIZATION ERROR:');
  console.error(`   Message: ${message}`);
  if (stack) {
    console.error(`   Stack trace:`);
    console.error(stack.split('\n').map(line => `     ${line}`).join('\n'));
  }
  console.error('');

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

    console.error('\n❌ UNCAUGHT EXCEPTION (server continuing):');
    console.error(`   Message: ${message}`);
    console.error(`   Stack trace:`);
    console.error(stack?.split('\n').map(line => `     ${line}`).join('\n'));

    debugLogError('UNCAUGHT_EXCEPTION', error, {
      errorType: errorType,
      stack: stack
    });

    console.error('   ⚠️  Server continuing despite error\n');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const { message, stack, errorType } = formatErrorDetails(reason);

    console.error('\n❌ UNHANDLED PROMISE REJECTION (server continuing):');
    console.error(`   Reason: ${message}`);
    if (stack) {
      console.error(`   Stack trace:`);
      console.error(stack.split('\n').map(line => `     ${line}`).join('\n'));
    }

    debugLogError('UNHANDLED_REJECTION', reason, {
      errorType: errorType,
      stack: stack,
      promise: String(promise)
    });

    console.error('   ⚠️  Server continuing despite error\n');
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\n✓ Shutting down MCP server...');
    if (onCleanup) {
      onCleanup();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\n✓ Shutting down MCP server...');
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
