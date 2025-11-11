import type { Knex } from 'knex';

/**
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

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';

  // Skip on SQLite (handled by 20251105000000)
  if (isSQLite) {
    console.log('✓ SQLite database detected, skipping (handled by 20251105000000)');
    return;
  }

  // Check if table already exists
  const hasTable = await knex.schema.hasTable('t_help_token_usage');
  if (hasTable) {
    console.log('✓ t_help_token_usage table already exists, skipping');
    return;
  }

  console.log(`🔧 Creating t_help_token_usage table for ${client}...`);

  await knex.schema.createTable('t_help_token_usage', (table) => {
    table.increments('usage_id').primary();

    // Use VARCHAR instead of TEXT for better MySQL compatibility
    const isMySQL = client === 'mysql' || client === 'mysql2';
    if (isMySQL) {
      table.string('query_type', 100).notNullable();
      table.string('tool_name', 100).nullable();
      table.string('action_name', 100).nullable();
    } else {
      // PostgreSQL supports TEXT in indexes
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

  console.log('✓ t_help_token_usage table created');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';

  if (isSQLite) {
    console.log('✓ SQLite database detected, skipping rollback');
    return;
  }

  const hasTable = await knex.schema.hasTable('t_help_token_usage');
  if (!hasTable) {
    console.log('✓ t_help_token_usage table does not exist, skipping');
    return;
  }

  console.log('Dropping t_help_token_usage table...');
  await knex.schema.dropTable('t_help_token_usage');
  console.log('✓ t_help_token_usage table dropped');
}
