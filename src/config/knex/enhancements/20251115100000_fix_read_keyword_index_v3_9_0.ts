import type { Knex } from "knex";

/**
 * Migration: Fix idx_messages_to_agent Index - MySQL Reserved Keyword (v3.9.0)
 *
 * Problem: Bootstrap migration 20251025021351_create_indexes.ts creates index on
 * t_agent_messages(to_agent_id, read) but 'read' is a reserved keyword in MySQL/MariaDB.
 *
 * Solution: Drop and recreate index with properly quoted column name.
 *
 * Note: This is a hotfix migration. We cannot edit the bootstrap migration since
 * it's already pushed to the repository.
 */

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';
  const isMySQL = client === 'mysql2' || client === 'mysql';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  // Check if table exists
  const hasTable = await knex.schema.hasTable('t_agent_messages');
  if (!hasTable) {
    console.log('⏭️  Skipping index fix: t_agent_messages table does not exist');
    return;
  }

  // Drop the problematic index if it exists
  if (isSQLite) {
    await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  } else if (isMySQL) {
    // MySQL doesn't support IF EXISTS for DROP INDEX, so check first
    const indexes = await knex.raw(`
      SELECT DISTINCT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 't_agent_messages'
        AND INDEX_NAME = 'idx_messages_to_agent'
    `);

    if (indexes[0].length > 0) {
      await knex.raw('DROP INDEX idx_messages_to_agent ON t_agent_messages');
    }
  } else if (isPostgreSQL) {
    await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  }

  // Recreate index with properly quoted column name
  if (isSQLite) {
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON t_agent_messages(to_agent_id, "read")');
  } else if (isMySQL) {
    // MySQL uses backticks for quoting identifiers
    await knex.raw('CREATE INDEX idx_messages_to_agent ON t_agent_messages(to_agent_id, `read`)');
  } else if (isPostgreSQL) {
    // PostgreSQL uses double quotes for quoting identifiers
    await knex.raw('CREATE INDEX idx_messages_to_agent ON t_agent_messages(to_agent_id, "read")');
  }

  console.log('✅ Fixed idx_messages_to_agent index with quoted column name');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Drop the fixed index
  if (isSQLite) {
    await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  } else {
    await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  }

  console.log('✅ Dropped idx_messages_to_agent index');
}
