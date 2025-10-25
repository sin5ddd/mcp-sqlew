/**
 * Token Logging Utility
 *
 * Logs token usage to database for measuring help system efficiency.
 */

import { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

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
 * @param db - Database connection
 * @param entry - Token log entry
 */
export function logTokenUsage(db: Database, entry: TokenLogEntry): void {
  try {
    // Check if table exists (migration may not have run yet)
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_help_token_usage'"
    ).get();

    if (!tableExists) {
      // Silently skip if table doesn't exist
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO t_help_token_usage
        (query_type, tool_name, action_name, estimated_tokens, actual_chars)
      VALUES
        (?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.query_type,
      entry.tool_name || null,
      entry.action_name || null,
      entry.estimated_tokens,
      entry.actual_chars
    );
  } catch (error) {
    // Silently fail - logging should not break functionality
    console.error('Warning: Failed to log token usage:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get token usage statistics for a query type
 *
 * @param db - Database connection
 * @param query_type - Type of query
 * @returns Statistics object
 */
export function getTokenStats(db: Database, query_type: string): {
  total_queries: number;
  avg_tokens: number;
  min_tokens: number;
  max_tokens: number;
  total_tokens: number;
} | null {
  try {
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_help_token_usage'"
    ).get();

    if (!tableExists) {
      return null;
    }

    const result = db.prepare(`
      SELECT
        COUNT(*) as total_queries,
        AVG(estimated_tokens) as avg_tokens,
        MIN(estimated_tokens) as min_tokens,
        MAX(estimated_tokens) as max_tokens,
        SUM(estimated_tokens) as total_tokens
      FROM t_help_token_usage
      WHERE query_type = ?
    `).get(query_type) as {
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
 * @param db - Database connection
 * @returns Map of query type to statistics
 */
export function getAllTokenStats(db: Database): Map<string, {
  total_queries: number;
  avg_tokens: number;
  min_tokens: number;
  max_tokens: number;
  total_tokens: number;
}> {
  const stats = new Map();

  try {
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_help_token_usage'"
    ).get();

    if (!tableExists) {
      return stats;
    }

    const results = db.prepare(`
      SELECT
        query_type,
        COUNT(*) as total_queries,
        AVG(estimated_tokens) as avg_tokens,
        MIN(estimated_tokens) as min_tokens,
        MAX(estimated_tokens) as max_tokens,
        SUM(estimated_tokens) as total_tokens
      FROM t_help_token_usage
      GROUP BY query_type
      ORDER BY query_type
    `).all() as Array<{
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
