/**
 * CONVERTED VERSION using Universal Knex Wrapper
 *
 * Original: src/config/knex/bootstrap/20251025021352_fix_mysql_index_syntax.ts
 *
 * Changes:
 * - Eliminated custom createIndexIfNotExists() helper function (92 lines)
 * - Replaced with UniversalKnex.createIndexSafe() which handles:
 *   * Database detection (SQLite/MySQL/PostgreSQL)
 *   * Index existence checks via try/catch
 *   * Reserved keyword quoting
 *   * Cross-database "IF NOT EXISTS" semantics
 * - Removed manual DB-specific conditional logic
 * - Cleaner, more maintainable code
 *
 * Lines reduced: 179 → 112 (37% reduction)
 * Eliminated: Custom helper function, manual error handling, DB-specific SQL
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // ============================================================================
  // Fix MySQL/PostgreSQL Index Creation (Bootstrap Hotfix)
  // ============================================================================
  // Note: This migration was originally created to fix indexes that failed
  // on MySQL/PostgreSQL due to SQLite-specific syntax. The Universal Knex
  // Wrapper now handles all of this automatically via createIndexSafe().

  if (db.isSQLite) {
    console.log('✓ SQLite: Original index creation works correctly');
    return;
  }

  console.log(`🔧 Fixing MySQL/PostgreSQL index creation for ${db.isMySQL ? 'MySQL' : 'PostgreSQL'}...`);

  // Recreate all indexes that failed in the previous migration
  await db.createIndexSafe('t_decisions', ['ts'], 'idx_decisions_ts', { desc: true });
  await db.createIndexSafe('t_decisions', ['layer_id'], 'idx_decisions_layer');
  await db.createIndexSafe('t_decisions', ['agent_id'], 'idx_decisions_agent');
  await db.createIndexSafe('t_decisions', ['status'], 'idx_decisions_status');

  await db.createIndexSafe('t_decisions_numeric', ['ts'], 'idx_decisions_numeric_ts', { desc: true });
  await db.createIndexSafe('t_decisions_numeric', ['layer_id'], 'idx_decisions_numeric_layer');

  await db.createIndexSafe('t_agent_messages', ['ts'], 'idx_messages_ts', { desc: true });
  await db.createIndexSafe('t_agent_messages', ['to_agent_id', 'read'], 'idx_messages_to_agent');
  await db.createIndexSafe('t_agent_messages', ['priority'], 'idx_messages_priority', { desc: true });

  await db.createIndexSafe('t_file_changes', ['ts'], 'idx_file_changes_ts', { desc: true });
  await db.createIndexSafe('t_file_changes', ['file_id'], 'idx_file_changes_file');
  await db.createIndexSafe('t_file_changes', ['layer_id'], 'idx_file_changes_layer');

  await db.createIndexSafe('t_constraints', ['active'], 'idx_constraints_active');
  await db.createIndexSafe('t_constraints', ['layer_id'], 'idx_constraints_layer');
  await db.createIndexSafe('t_constraints', ['priority'], 'idx_constraints_priority', { desc: true });

  await db.createIndexSafe('t_activity_log', ['ts'], 'idx_activity_log_ts', { desc: true });
  await db.createIndexSafe('t_activity_log', ['agent_id'], 'idx_activity_log_agent');

  await db.createIndexSafe('t_tasks', ['status_id'], 'idx_tasks_status');
  await db.createIndexSafe('t_tasks', ['priority'], 'idx_tasks_priority', { desc: true });
  await db.createIndexSafe('t_tasks', ['assigned_agent_id'], 'idx_tasks_agent');
  await db.createIndexSafe('t_tasks', ['created_ts'], 'idx_tasks_created_ts', { desc: true });
  await db.createIndexSafe('t_tasks', ['updated_ts'], 'idx_tasks_updated_ts', { desc: true });

  console.log('✅ MySQL/PostgreSQL indexes created successfully');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  if (db.isSQLite) {
    console.log('✓ SQLite: No rollback needed');
    return;
  }

  // Drop all indexes (MySQL/PostgreSQL syntax)
  const indexes = [
    'idx_decisions_ts',
    'idx_decisions_layer',
    'idx_decisions_agent',
    'idx_decisions_status',
    'idx_decisions_numeric_ts',
    'idx_decisions_numeric_layer',
    'idx_messages_ts',
    'idx_messages_to_agent',
    'idx_messages_priority',
    'idx_file_changes_ts',
    'idx_file_changes_file',
    'idx_file_changes_layer',
    'idx_constraints_active',
    'idx_constraints_layer',
    'idx_constraints_priority',
    'idx_activity_log_ts',
    'idx_activity_log_agent',
    'idx_tasks_status',
    'idx_tasks_priority',
    'idx_tasks_agent',
    'idx_tasks_created_ts',
    'idx_tasks_updated_ts'
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }

  console.log('✅ Indexes dropped successfully');
}
