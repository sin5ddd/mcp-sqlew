import type { Knex } from 'knex';

/**
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

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';

  // **BUG FIX v3.7.5**: MySQL/PostgreSQL compatibility issue with DEFAULT UNIX_TIMESTAMP()
  // MySQL/PostgreSQL handled by 20251109000003_token_usage_cross_db_compat_v3_7_5.ts
  if (!isSQLite) {
    console.log(`✓ Non-SQLite database (${client}) detected, skipping (handled by 20251109000003)`);
    return;
  }

  // Check if table already exists (idempotency)
  const hasTable = await knex.schema.hasTable('t_help_token_usage');
  if (hasTable) {
    console.log('✓ t_help_token_usage table already exists, skipping');
    return;
  }

  console.log('Creating t_help_token_usage table...');

  await knex.schema.createTable('t_help_token_usage', (table) => {
    table.increments('usage_id').primary();
    table.text('query_type').notNullable();
    table.text('tool_name').nullable();
    table.text('action_name').nullable();
    table.integer('estimated_tokens').notNullable();
    table.integer('actual_chars').notNullable();

    // Integer timestamp with database-specific defaults
    if (client === 'better-sqlite3' || client === 'sqlite3') {
      // SQLite: strftime returns Unix timestamp
      table.integer('timestamp').notNullable().defaultTo(knex.raw("(strftime('%s', 'now'))"));
    } else if (client === 'mysql' || client === 'mysql2') {
      // MySQL: UNIX_TIMESTAMP() returns Unix timestamp
      table.integer('timestamp').notNullable().defaultTo(knex.raw('UNIX_TIMESTAMP()'));
    } else if (client === 'pg' || client === 'postgresql') {
      // PostgreSQL: EXTRACT(epoch FROM NOW()) returns Unix timestamp as integer
      table.integer('timestamp').notNullable().defaultTo(knex.raw('EXTRACT(epoch FROM NOW())::INTEGER'));
    } else {
      // Fallback: no default (application must provide timestamp)
      table.integer('timestamp').notNullable();
    }

    // Indexes for common queries
    table.index('query_type');
    table.index(['tool_name', 'action_name']);
    // Descending index for timestamp (most recent first)
    table.index(['timestamp'], undefined, 'DESC');
  });

  console.log('✓ t_help_token_usage table created');
}

export async function down(knex: Knex): Promise<void> {
  // Check if table exists before dropping
  const hasTable = await knex.schema.hasTable('t_help_token_usage');
  if (!hasTable) {
    console.log('✓ t_help_token_usage table does not exist, skipping');
    return;
  }

  console.log('Dropping t_help_token_usage table...');
  await knex.schema.dropTable('t_help_token_usage');
  console.log('✓ t_help_token_usage table dropped');
}
