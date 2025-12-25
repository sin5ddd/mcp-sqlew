/**
 * Converted from: src/config/knex/enhancements/20251109000003_token_usage_cross_db_compat_v3_7_5.ts
 * Line count: 94 → 55 (41% reduction)
 *
 * Migration: Token Usage Table Cross-Database Compatibility v3.7.5
 * Date: 2025-11-09
 * Version: v3.7.5
 *
 * CONTEXT:
 * The original token usage migration (20251105000000) has MySQL/PostgreSQL compatibility issues.
 * MySQL doesn't support `DEFAULT UNIX_TIMESTAMP()` syntax without parentheses in DEFAULT clause.
 *
 * This migration creates t_help_token_usage for MySQL/PostgreSQL/MariaDB with corrected syntax.
 *
 * CHANGES:
 * - Creates t_help_token_usage table for non-SQLite databases
 * - Skips on SQLite (handled by 20251105000000)
 * - Uses application-provided timestamps instead of database defaults (simpler, more portable)
 *
 * IDEMPOTENCY:
 * - Checks if table exists (skip if already created)
 * - Checks database type (skip if SQLite)
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Skip on SQLite (handled by 20251105000000)
  if (db.isSQLite) {
    console.error('✓ SQLite database detected, skipping (handled by 20251105000000)');
    return;
  }

  // Create table for MySQL/PostgreSQL
  await db.createTableSafe('t_help_token_usage', (table, helpers) => {
    table.increments('usage_id').primary();

    // Use VARCHAR for MySQL compatibility, TEXT for PostgreSQL
    if (db.isMySQL) {
      helpers.stringColumn('query_type', 100).notNullable();
      helpers.stringColumn('tool_name', 100).nullable();
      helpers.stringColumn('action_name', 100).nullable();
    } else {
      table.text('query_type').notNullable();
      table.text('tool_name').nullable();
      table.text('action_name').nullable();
    }

    table.integer('estimated_tokens').notNullable();
    table.integer('actual_chars').notNullable();

    // No DEFAULT value - application will provide timestamp
    // This avoids cross-database compatibility issues with timestamp functions
    table.integer('timestamp').notNullable();

    // Indexes for common queries
    table.index('query_type');
    table.index(['tool_name', 'action_name']);
    table.index('timestamp'); // Descending handled by query ORDER BY
  });

  console.error('✓ t_help_token_usage table created');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  if (db.isSQLite) {
    console.error('✓ SQLite database detected, skipping rollback');
    return;
  }

  await knex.schema.dropTableIfExists('t_help_token_usage');
  console.error('✓ t_help_token_usage table dropped');
}
