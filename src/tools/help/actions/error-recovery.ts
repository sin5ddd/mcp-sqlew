/**
 * Help Tool - error_recovery Action
 * Analyze errors and suggest fixes
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { HelpErrorRecoveryParams, HelpErrorRecoveryResult } from '../types.js';

/**
 * Error pattern matching for common errors
 */
interface ErrorPattern {
  pattern: RegExp;
  cause: string;
  solution: string;
  example: string;
  prevention: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /action.*required|missing.*action/i,
    cause: 'Missing "action" parameter in tool call',
    solution: 'Every sqlew tool call must include action parameter',
    example: 'decision({ action: "set", key: "...", value: "..." })',
    prevention: 'Always use help({ action: "query_action", ... }) to verify syntax before calling'
  },
  {
    pattern: /tags.*must.*array/i,
    cause: 'Tags parameter passed as string instead of array',
    solution: 'Use array syntax for tags',
    example: 'tags: ["security", "api"]  // Not "security,api"',
    prevention: 'Check help({ action: "query_params", ... }) for correct parameter types'
  },
  {
    pattern: /constraint.*key.*not found|decision.*not found/i,
    cause: 'Referenced decision key does not exist',
    solution: 'Create decision first, then reference it in constraint',
    example: 'decision({ action: "set", key: "my-decision", ... })\nconstraint({ action: "add", ..., related_context_key: "my-decision" })',
    prevention: 'Use decision({ action: "list" }) to verify key exists before referencing'
  },
  {
    pattern: /file_actions.*required/i,
    cause: 'FILE_REQUIRED layer task missing file_actions parameter',
    solution: 'Include file_actions array for presentation, business, data, infrastructure, cross-cutting, documentation layers',
    example: 'task({ action: "create", layer: "business", file_actions: [{ action: "create", path: "src/file.ts" }] })',
    prevention: 'Use file_actions: [] for planning tasks, or use planning/coordination/review layers for non-file work'
  },
  {
    pattern: /layer.*invalid|layer.*not found/i,
    cause: 'Invalid layer name specified',
    solution: 'Use one of the 9 valid layers',
    example: 'Valid layers: presentation, business, data, infrastructure, cross-cutting, documentation, planning, coordination, review',
    prevention: 'Check help({ action: "query_tool", tool: "task" }) for layer descriptions'
  },
  {
    pattern: /task.*not found|task_id.*invalid/i,
    cause: 'Referenced task does not exist',
    solution: 'Verify task exists before linking or updating',
    example: 'task({ action: "list" })  // Find valid task IDs first',
    prevention: 'Use task({ action: "get", task_id: ... }) to verify task exists'
  },
  {
    pattern: /circular.*dependency|dependency.*cycle/i,
    cause: 'Task dependency creates a circular reference',
    solution: 'Remove dependency that creates the cycle',
    example: 'task({ action: "remove_dependency", task_id: ..., depends_on: ... })',
    prevention: 'Plan task dependencies in a directed acyclic graph (DAG)'
  },
  {
    pattern: /agent.*not found/i,
    cause: 'Referenced agent does not exist',
    solution: 'Agent will be auto-created on first use, or verify agent name',
    example: 'task({ action: "create", assigned_agent: "my-agent", ... })',
    prevention: 'Agent names are auto-registered; use consistent naming'
  },
  {
    pattern: /priority.*invalid/i,
    cause: 'Invalid priority value specified',
    solution: 'Use one of: low, medium, high, critical',
    example: 'task({ action: "create", priority: "high", ... })',
    prevention: 'Check help({ action: "query_params", tool: "task", target_action: "create" }) for valid enum values'
  },
  {
    pattern: /database.*locked|SQLITE_BUSY/i,
    cause: 'Database is locked by another process or transaction',
    solution: 'Wait briefly and retry, or check for long-running transactions',
    example: 'Retry after 100-500ms, or use stats({ action: "flush" }) to checkpoint WAL',
    prevention: 'Avoid long-running transactions, use batch operations for bulk inserts'
  }
];

/**
 * Get error recovery suggestions
 * Pattern matches common errors and provides solutions
 */
export async function errorRecovery(
  params: HelpErrorRecoveryParams,
  adapter?: DatabaseAdapter
): Promise<HelpErrorRecoveryResult> {
  const actualAdapter = adapter ?? getAdapter();

  // Find matching error pattern
  const match = ERROR_PATTERNS.find(p => p.pattern.test(params.error_message));

  if (match) {
    return {
      error: params.error_message,
      cause: match.cause,
      solution: match.solution,
      example: match.example,
      prevention: match.prevention
    };
  }

  // Generic fallback for unknown errors
  const toolHint = params.tool
    ? `help({ action: "query_tool", tool: "${params.tool}" })`
    : 'help({ action: "query_tool", tool: "..." })';

  return {
    error: params.error_message,
    cause: 'Unknown error - pattern not recognized',
    solution: `Check tool documentation: ${toolHint}`,
    example: 'help({ action: "query_action", tool: "decision", target_action: "set" })',
    prevention: 'Always verify syntax with help tool before calling unfamiliar actions'
  };
}
