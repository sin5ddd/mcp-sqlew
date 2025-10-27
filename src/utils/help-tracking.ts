/**
 * Help Action Usage Tracking
 *
 * Lightweight logging system to track help/example action invocations
 * for understanding usage patterns and optimizing documentation.
 *
 * Data collected:
 * - tool_name: Which MCP tool invoked help/example
 * - action_name: "help" or "example"
 * - timestamp: When the action was invoked
 * - token_count: Estimated tokens in request + response
 *
 * Storage: Temporary log file in .sqlew/tmp/help-usage.log
 * Format: JSON lines (one JSON object per line for easy parsing)
 * Retention: Manual cleanup after 1-2 week analysis period
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

/**
 * Help action invocation record
 */
export interface HelpUsageRecord {
  tool_name: string;
  action_name: 'help' | 'example' | 'use_case';
  timestamp: string; // ISO 8601 format
  token_count: number; // Estimated request + response tokens
  context?: string; // Optional: what triggered the help action
}

/**
 * Log file configuration
 */
const LOG_DIR = resolve(process.cwd(), '.sqlew', 'tmp');
const LOG_FILE = resolve(LOG_DIR, 'help-usage.log');

/**
 * Initialize logging directory
 * Creates .sqlew/tmp/ if it doesn't exist
 */
function ensureLogDirectory(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a help action invocation
 * Appends JSON line to log file for analysis
 *
 * @param record - Help usage record to log
 */
export function logHelpUsage(record: HelpUsageRecord): void {
  try {
    ensureLogDirectory();

    // Append as JSON line (newline-delimited JSON)
    const jsonLine = JSON.stringify(record) + '\n';
    appendFileSync(LOG_FILE, jsonLine, 'utf8');
  } catch (error) {
    // Silent failure - don't break tool execution if logging fails
    console.error('[Help Tracking] Failed to log usage:', error);
  }
}

/**
 * Estimate token count for help/example action
 * Rough estimation based on response length
 *
 * @param toolName - Name of the MCP tool
 * @param actionName - "help" or "example"
 * @param responseLength - Length of response text
 * @returns Estimated token count (request + response)
 */
export function estimateHelpTokens(
  toolName: string,
  actionName: 'help' | 'example' | 'use_case',
  responseLength: number
): number {
  // Request tokens: tool name + action parameter (~50 tokens)
  const requestTokens = 50;

  // Response tokens: approximate 4 chars per token
  const responseTokens = Math.ceil(responseLength / 4);

  return requestTokens + responseTokens;
}

/**
 * Track help action and return the help content
 * Convenience wrapper that logs and returns content
 *
 * @param toolName - Name of the MCP tool
 * @param actionName - "help" or "example"
 * @param content - Help content to return
 * @param context - Optional context about what triggered help
 * @returns The help content (pass-through)
 */
export function trackAndReturnHelp(
  toolName: string,
  actionName: 'help' | 'example' | 'use_case',
  content: string,
  context?: string
): string {
  const tokenCount = estimateHelpTokens(toolName, actionName, content.length);

  logHelpUsage({
    tool_name: toolName,
    action_name: actionName,
    timestamp: new Date().toISOString(),
    token_count: tokenCount,
    context
  });

  return content;
}
