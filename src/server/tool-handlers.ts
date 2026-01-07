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
import { getBackend } from '../backend/index.js';

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
    const result = await backend.execute(name, action, params);

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
