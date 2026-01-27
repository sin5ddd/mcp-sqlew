/**
 * v5.0: Drop all legacy v3 tables (m_* and t_* prefix)
 *
 * This migration removes all v3.x legacy tables that were kept
 * for backward compatibility during v3→v4 migration period.
 *
 * Also removes v4_decision_pruning_log (created but never used).
 *
 * Legacy tables dropped:
 * - m_* (14 master tables)
 * - t_* (25 transaction tables)
 * - v4_decision_pruning_log (unused)
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';

// Legacy master tables (m_* prefix) - v3.x schema
const LEGACY_MASTER_TABLES = [
  'm_agents',
  'm_config', // Deprecated config table (replaced by config.toml)
  'm_constraint_categories',
  'm_context_keys',
  'm_files',
  'm_help_actions',
  'm_help_tools',
  'm_help_use_case_categories',
  'm_layers',
  'm_projects',
  'm_scopes',
  'm_tags',
  'm_task_statuses',
];

// Legacy transaction tables (t_* prefix) - v3.x schema
// Ordered by FK dependencies (children first)
const LEGACY_TRANSACTION_TABLES = [
  // Task-related (children first)
  't_task_file_links',
  't_task_dependencies',
  't_task_constraint_links',
  't_task_decision_links',
  't_task_details',
  't_task_pruned_files',
  't_task_tags',
  't_tasks',
  // Decision-related
  't_decision_context',
  't_decision_history',
  't_decision_policies',
  't_decision_scopes',
  't_decision_tags',
  't_decisions_numeric',
  't_decisions',
  't_decision_templates', // References m_agents
  // File-related
  't_file_changes',
  // Constraint-related
  't_constraint_tags',
  't_constraints',
  // Help-related
  't_help_action_examples',
  't_help_action_params',
  't_help_action_sequences',
  't_help_token_usage',
  't_help_use_cases',
  // Activity log
  't_activity_log',
];

// v4 tables that are unused
const UNUSED_V4_TABLES = [
  'v4_decision_pruning_log',
];

export async function up(knex: Knex): Promise<void> {
  console.error('🔄 v5.0: Dropping legacy v3 tables and unused v4 tables...');

  let droppedCount = 0;
  let skippedCount = 0;

  // Step 1: Drop legacy transaction tables (t_*)
  console.error('\n📝 Step 1: Dropping legacy transaction tables (t_*)...');
  for (const tableName of LEGACY_TRANSACTION_TABLES) {
    try {
      const exists = await knex.schema.hasTable(tableName);
      if (exists) {
        await knex.schema.dropTable(tableName);
        console.error(`  ✓ Dropped: ${tableName}`);
        droppedCount++;
      } else {
        skippedCount++;
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message?.toLowerCase() : String(error).toLowerCase();
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown table') ||
        errorMsg.includes('no such table')
      ) {
        skippedCount++;
      } else {
        throw error;
      }
    }
  }

  // Step 2: Drop legacy master tables (m_*)
  console.error('\n📝 Step 2: Dropping legacy master tables (m_*)...');
  for (const tableName of LEGACY_MASTER_TABLES) {
    try {
      const exists = await knex.schema.hasTable(tableName);
      if (exists) {
        await knex.schema.dropTable(tableName);
        console.error(`  ✓ Dropped: ${tableName}`);
        droppedCount++;
      } else {
        skippedCount++;
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message?.toLowerCase() : String(error).toLowerCase();
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown table') ||
        errorMsg.includes('no such table')
      ) {
        skippedCount++;
      } else {
        throw error;
      }
    }
  }

  // Step 3: Drop unused v4 tables
  console.error('\n📝 Step 3: Dropping unused v4 tables...');
  for (const tableName of UNUSED_V4_TABLES) {
    try {
      const exists = await knex.schema.hasTable(tableName);
      if (exists) {
        await knex.schema.dropTable(tableName);
        console.error(`  ✓ Dropped: ${tableName}`);
        droppedCount++;
      } else {
        skippedCount++;
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message?.toLowerCase() : String(error).toLowerCase();
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown table') ||
        errorMsg.includes('no such table')
      ) {
        skippedCount++;
      } else {
        throw error;
      }
    }
  }

  console.error(`\n✅ Legacy table cleanup complete`);
  console.error(`   Dropped: ${droppedCount} tables`);
  console.error(`   Skipped: ${skippedCount} tables (already removed)`);
  console.error('📝 Remaining: v4_* tables only (clean v5 schema)');
}

export async function down(_knex: Knex): Promise<void> {
  console.error('⚠️  WARNING: Legacy v3 tables will NOT be recreated');
  console.error('   These tables were deprecated in v4.0 and removed in v5.0');
  console.error('   Data has been migrated to v4_* tables');
  console.error('');
  console.error('   If you need to restore legacy schema:');
  console.error('   - Create fresh database');
  console.error('   - Run migrations from v3.x');
}
