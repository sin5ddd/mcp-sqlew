/**
 * Migration: Add Token Tracking Table (v3.6.0)
 *
 * Creates table for tracking help system token usage to measure efficiency gains.
 *
 * Table Created:
 * - t_help_token_usage: Tracks token consumption per query type
 */

import { Database } from 'better-sqlite3';

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * Check if migration is needed
 */
export function needsTokenTrackingMigration(db: Database): boolean {
  // Check if token tracking table doesn't exist yet
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_help_token_usage'"
  ).get();

  return tableExists === undefined;
}

/**
 * Run the migration
 */
export function migrateToTokenTracking(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // Create t_help_token_usage table
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_help_token_usage (
        usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_type TEXT NOT NULL,
        tool_name TEXT,
        action_name TEXT,
        estimated_tokens INTEGER NOT NULL,
        actual_chars INTEGER NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
    details.push('Created table: t_help_token_usage');

    // Create indexes for analysis queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_token_usage_query_type
      ON t_help_token_usage(query_type)
    `);
    details.push('Created index: idx_help_token_usage_query_type');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_token_usage_timestamp
      ON t_help_token_usage(timestamp DESC)
    `);
    details.push('Created index: idx_help_token_usage_timestamp');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_token_usage_tool_action
      ON t_help_token_usage(tool_name, action_name)
    `);
    details.push('Created index: idx_help_token_usage_tool_action');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Token tracking migration completed successfully (v3.6.0)',
      details
    };

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Token tracking migration failed: ${message}`,
      details
    };
  }
}

/**
 * Get migration info
 */
export function getTokenTrackingMigrationInfo(): string {
  return `
Migration: Add Token Tracking Table (v3.6.0)

This migration creates 1 new table for tracking help system token usage:

Transaction Table (t_ prefix):
  1. t_help_token_usage - Token consumption metrics per query

Fields:
  - usage_id: Auto-incrementing primary key
  - query_type: Type of query (help_action, help_params, etc.)
  - tool_name: Tool name (if applicable)
  - action_name: Action name (if applicable)
  - estimated_tokens: Estimated token count
  - actual_chars: Actual character count
  - timestamp: Unix epoch timestamp

Indexes:
  - idx_help_token_usage_query_type (query_type)
  - idx_help_token_usage_timestamp (timestamp DESC)
  - idx_help_token_usage_tool_action (tool_name, action_name)

Benefits:
- Track actual token consumption for help queries
- Measure efficiency gains vs legacy help system
- Analyze usage patterns and optimize responses
- Validate token reduction claims

This migration is safe and additive (no data loss).
  `.trim();
}
