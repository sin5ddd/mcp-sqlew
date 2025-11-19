/**
 * Token Logging Utility
 *
 * Logs token usage to database for measuring help system efficiency.
 */

import type { DatabaseAdapter } from '../adapters/index.js';
import { getAdapter } from '../database.js';

export interface TokenLogEntry {
  query_type: string;
  tool_name?: string;
  action_name?: string;
  estimated_tokens: number;
  actual_chars: number;
}

/**
 * Log token usage to database
 *
 * @param adapter - Database adapter (optional, will use global if not provided)
 * @param entry - Token log entry
 */
export async function logTokenUsage(entry: TokenLogEntry, adapter?: DatabaseAdapter): Promise<void> {
  try {
    const actualAdapter = adapter ?? getAdapter();
    const knex = actualAdapter.getKnex();

    // Check if table exists (migration may not have run yet)
    const tableExists = await knex.schema.hasTable('t_help_token_usage');

    if (!tableExists) {
      // Silently skip if table doesn't exist
      return;
    }

    await knex('t_help_token_usage').insert({
      query_type: entry.query_type,
      tool_name: entry.tool_name || null,
      action_name: entry.action_name || null,
      estimated_tokens: entry.estimated_tokens,
      actual_chars: entry.actual_chars
    });
  } catch (error) {
    // Silently fail - logging should not break functionality
    console.error('Warning: Failed to log token usage:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get token usage statistics for a query type
 *
 * @param query_type - Type of query
 * @param adapter - Database adapter (optional, will use global if not provided)
 * @returns Statistics object
 */
export async function getTokenStats(query_type: string, adapter?: DatabaseAdapter): Promise<{
  total_queries: number;
  avg_tokens: number;
  min_tokens: number;
  max_tokens: number;
  total_tokens: number;
} | null> {
  try {
    const actualAdapter = adapter ?? getAdapter();
    const knex = actualAdapter.getKnex();

    const tableExists = await knex.schema.hasTable('t_help_token_usage');

    if (!tableExists) {
      return null;
    }

    const result = await knex('t_help_token_usage')
      .where({ query_type })
      .select(
        knex.raw('COUNT(*) as total_queries'),
        knex.raw('AVG(estimated_tokens) as avg_tokens'),
        knex.raw('MIN(estimated_tokens) as min_tokens'),
        knex.raw('MAX(estimated_tokens) as max_tokens'),
        knex.raw('SUM(estimated_tokens) as total_tokens')
      )
      .first() as {
        total_queries: number;
        avg_tokens: number;
        min_tokens: number;
        max_tokens: number;
        total_tokens: number;
      } | undefined;

    if (!result || result.total_queries === 0) {
      return null;
    }

    return {
      total_queries: result.total_queries,
      avg_tokens: Math.round(result.avg_tokens),
      min_tokens: result.min_tokens,
      max_tokens: result.max_tokens,
      total_tokens: result.total_tokens
    };
  } catch (error) {
    console.error('Warning: Failed to get token stats:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get all token usage statistics
 *
 * @param adapter - Database adapter (optional, will use global if not provided)
 * @returns Map of query type to statistics
 */
export async function getAllTokenStats(adapter?: DatabaseAdapter): Promise<Map<string, {
  total_queries: number;
  avg_tokens: number;
  min_tokens: number;
  max_tokens: number;
  total_tokens: number;
}>> {
  const stats = new Map();

  try {
    const actualAdapter = adapter ?? getAdapter();
    const knex = actualAdapter.getKnex();

    const tableExists = await knex.schema.hasTable('t_help_token_usage');

    if (!tableExists) {
      return stats;
    }

    const results = await knex('t_help_token_usage')
      .select('query_type')
      .count('* as total_queries')
      .avg('estimated_tokens as avg_tokens')
      .min('estimated_tokens as min_tokens')
      .max('estimated_tokens as max_tokens')
      .sum('estimated_tokens as total_tokens')
      .groupBy('query_type')
      .orderBy('query_type') as Array<{
        query_type: string;
        total_queries: number;
        avg_tokens: number;
        min_tokens: number;
        max_tokens: number;
        total_tokens: number;
      }>;

    for (const row of results) {
      stats.set(row.query_type, {
        total_queries: row.total_queries,
        avg_tokens: Math.round(row.avg_tokens),
        min_tokens: row.min_tokens,
        max_tokens: row.max_tokens,
        total_tokens: row.total_tokens
      });
    }
  } catch (error) {
    console.error('Warning: Failed to get all token stats:', error instanceof Error ? error.message : String(error));
  }

  return stats;
}
