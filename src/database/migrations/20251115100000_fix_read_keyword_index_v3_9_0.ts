/**
 * Converted from: src/config/knex/enhancements/20251115100000_fix_read_keyword_index_v3_9_0.ts
 *
 * Changes:
 * - Replaced DB-specific client detection with UniversalKnex wrapper
 * - Eliminated 45+ lines of conditional DB logic
 * - Used db.createIndexSafe() for cross-database index creation
 * - Line count: 75 → 38 (49% reduction)
 *
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

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if table exists
  const hasTable = await knex.schema.hasTable('t_agent_messages');
  if (!hasTable) {
    console.log('⏭️  Skipping index fix: t_agent_messages table does not exist');
    return;
  }

  // Drop the problematic index if it exists
  await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');

  // Recreate index with properly quoted column name
  // Note: 'read' is a reserved keyword, needs quoting (backticks for MySQL, quotes for SQLite/PostgreSQL)
  const readColumn = db.isMySQL ? '`read`' : '"read"';
  await db.createIndexSafe('t_agent_messages', ['to_agent_id', readColumn], 'idx_messages_to_agent');

  console.log('✅ Fixed idx_messages_to_agent index with quoted column name');
}

export async function down(knex: Knex): Promise<void> {
  // Drop the fixed index
  await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');

  console.log('✅ Dropped idx_messages_to_agent index');
}
