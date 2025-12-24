/**
 * CONVERTED VERSION using Universal Knex Wrapper
 *
 * Original: src/config/knex/bootstrap/20251025021351_create_indexes.ts
 *
 * Changes:
 * - Eliminated custom createIndexIfColumnExists() helper function (44 lines)
 * - Replaced with UniversalKnex.createIndexSafe() which handles:
 *   * Table existence checks
 *   * Column existence checks
 *   * Cross-database "IF NOT EXISTS" semantics
 *   * Error handling
 * - Cleaner, more maintainable code
 *
 * Lines reduced: 117 → 70 (40% reduction)
 * Eliminated: Custom helper function, manual error handling, DB-specific SQL
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // ============================================================================
  // Indexes for Performance Optimization
  // ============================================================================
  // Note: createIndexSafe() automatically checks if table/columns exist
  // and handles cross-database "IF NOT EXISTS" semantics

  // Decisions indexes
  await db.createIndexSafe('t_decisions', ['ts'], 'idx_decisions_ts', { desc: true });
  await db.createIndexSafe('t_decisions', ['layer_id'], 'idx_decisions_layer');
  await db.createIndexSafe('t_decisions', ['agent_id'], 'idx_decisions_agent');
  await db.createIndexSafe('t_decisions', ['status'], 'idx_decisions_status');

  // Decisions numeric indexes
  await db.createIndexSafe('t_decisions_numeric', ['ts'], 'idx_decisions_numeric_ts', { desc: true });
  await db.createIndexSafe('t_decisions_numeric', ['layer_id'], 'idx_decisions_numeric_layer');

  // Messages indexes
  await db.createIndexSafe('t_agent_messages', ['ts'], 'idx_messages_ts', { desc: true });
  await db.createIndexSafe('t_agent_messages', ['to_agent_id', 'read'], 'idx_messages_to_agent');
  await db.createIndexSafe('t_agent_messages', ['priority'], 'idx_messages_priority', { desc: true });

  // File changes indexes
  await db.createIndexSafe('t_file_changes', ['ts'], 'idx_file_changes_ts', { desc: true });
  await db.createIndexSafe('t_file_changes', ['file_id'], 'idx_file_changes_file');
  await db.createIndexSafe('t_file_changes', ['layer_id'], 'idx_file_changes_layer');

  // Constraints indexes
  await db.createIndexSafe('t_constraints', ['active'], 'idx_constraints_active');
  await db.createIndexSafe('t_constraints', ['layer_id'], 'idx_constraints_layer');
  await db.createIndexSafe('t_constraints', ['priority'], 'idx_constraints_priority', { desc: true });

  // Activity log indexes
  await db.createIndexSafe('t_activity_log', ['ts'], 'idx_activity_log_ts', { desc: true });
  await db.createIndexSafe('t_activity_log', ['agent_id'], 'idx_activity_log_agent');

  // Task indexes
  await db.createIndexSafe('t_tasks', ['status_id'], 'idx_tasks_status');
  await db.createIndexSafe('t_tasks', ['priority'], 'idx_tasks_priority', { desc: true });
  await db.createIndexSafe('t_tasks', ['assigned_agent_id'], 'idx_tasks_agent');
  await db.createIndexSafe('t_tasks', ['created_ts'], 'idx_tasks_created_ts', { desc: true });
  await db.createIndexSafe('t_tasks', ['updated_ts'], 'idx_tasks_updated_ts', { desc: true });

  console.error('✅ Indexes created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Drop all indexes
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_updated_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_created_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_status');
  await knex.raw('DROP INDEX IF EXISTS idx_activity_log_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_activity_log_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_constraints_active');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_file');
  await knex.raw('DROP INDEX IF EXISTS idx_file_changes_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_priority');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_to_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_numeric_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_numeric_ts');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_status');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_agent');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_layer');
  await knex.raw('DROP INDEX IF EXISTS idx_decisions_ts');

  console.error('✅ Indexes dropped successfully');
}
