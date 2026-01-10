/**
 * MCP Server - Tool Call Handlers
 * Processes CallToolRequest and dispatches to appropriate tool actions
 *
 * v4.4.0+: Uses ToolBackend pattern for Local/Plugin abstraction
 * All tool execution logic is delegated to the active backend.
 */

import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { debugLogToolCall, debugLogToolResponse } from '../utils/debug-logger.js';
import { handleToolError } from '../utils/error-handler.js';
import { getBackend, getBackendType } from '../backend/index.js';
import { LocalBackend } from '../backend/local-backend.js';

/**
 * Handle CallToolRequest - dispatch to appropriate tool action
 *
 * Routes requests through the ToolBackend abstraction layer:
 * - LocalBackend: Executes against local database via Knex
 * - Plugin backends: Execute via plugin implementation (e.g., HTTP API)
 */
export async function handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
  const { name, arguments: args } = request.params;
  const params = args as Record<string, unknown>;
  const action = (params.action as string) || 'N/A';

  // Debug logging: Tool call
  debugLogToolCall(name, action, params);

  try {
    const backend = getBackend();

    // Execute via backend (all tool logic is in backend implementations)
    let result: unknown;
    try {
      result = await backend.execute(name, action, params);
    } catch (backendError) {
      // Fallback to LocalBackend for unsupported tools in plugin mode
      // This allows help/example/use_case to work locally while data tools use SaaS
      if (getBackendType() === 'plugin' && isUnsupportedToolError(backendError)) {
        const localBackend = new LocalBackend();
        result = await localBackend.execute(name, action, params);
      } else {
        throw backendError;
      }
    }

    // Debug logging: Success
    debugLogToolResponse(name, action, true, result);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    // Use centralized error handler (stack goes to logs only, not returned to client)
    const errorResult = handleToolError(name, action, error, params);

    // Check if this is a structured validation error or a simple message
    const errorResponse = errorResult.message !== undefined
      ? { error: errorResult.message }  // Regular error: wrap message
      : errorResult;  // Validation error: use structured object as-is

    debugLogToolResponse(name, action, false, undefined, errorResponse);

    return {
      content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }
}

/**
 * Check if error is an UNSUPPORTED_TOOL error from plugin backend
 * Used to determine if we should fallback to LocalBackend
 */
function isUnsupportedToolError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // Check for ApiError with code property
    if ('code' in error && error.code === 'UNSUPPORTED_TOOL') {
      return true;
    }
    // Check for error message pattern
    if ('message' in error && typeof error.message === 'string') {
      return error.message.includes('not supported in SaaS mode');
    }
  }
  return false;
}
