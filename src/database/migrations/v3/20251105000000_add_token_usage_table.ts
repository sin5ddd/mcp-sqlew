/**
 * Converted from: src/config/knex/enhancements/20251105000000_add_token_usage_table.ts
 * Line count: 81 → 50 (38% reduction)
 *
 * Migration: Add t_help_token_usage table
 *
 * Purpose: Re-add the token usage tracking table that was removed during
 * the migration system refactor (Oct 25-27, 2025).
 *
 * Context: The table was originally created by add-token-tracking.ts migration
 * but was not ported to the new Knex-only migration system. Production databases
 * from that transitional period have this table, but fresh installations don't.
 *
 * This migration ensures consistency across all databases.
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // **BUG FIX v3.7.5**: MySQL/PostgreSQL compatibility issue with DEFAULT UNIX_TIMESTAMP()
  // MySQL/PostgreSQL handled by 20251109000003_token_usage_cross_db_compat_v3_7_5.ts
  if (!db.isSQLite) {
    console.log(`✓ Non-SQLite database detected, skipping (handled by 20251109000003)`);
    return;
  }

  // Create table for SQLite only
  await db.createTableSafe('t_help_token_usage', (table, helpers) => {
    table.increments('usage_id').primary();
    table.text('query_type').notNullable();
    table.text('tool_name').nullable();
    table.text('action_name').nullable();
    table.integer('estimated_tokens').notNullable();
    table.integer('actual_chars').notNullable();

    // SQLite timestamp with default
    helpers.timestampColumn('timestamp');

    // Indexes for common queries
    table.index('query_type');
    table.index(['tool_name', 'action_name']);
    table.index(['timestamp'], undefined, 'DESC');
  });

  console.log('✓ t_help_token_usage table created');
}

export async function down(knex: Knex): Promise<void> {
  // Drop table if exists
  await knex.schema.dropTableIfExists('t_help_token_usage');
  console.log('✓ t_help_token_usage table dropped');
}
