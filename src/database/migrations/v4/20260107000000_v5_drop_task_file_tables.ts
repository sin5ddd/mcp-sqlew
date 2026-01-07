/**
 * v5.0: Drop deprecated task and file system tables
 *
 * This migration removes all task and file management functionality
 * that was deprecated in v4.3.0 and is now being removed for v5.0.
 *
 * Tables dropped:
 * - v4_task_file_links (task-file relationships)
 * - v4_task_dependencies (task dependency graph)
 * - v4_task_constraint_links (task-constraint relationships)
 * - v4_task_decision_links (task-decision relationships)
 * - v4_task_details (task detail records)
 * - v4_task_pruned_files (file pruning history)
 * - v4_task_tags (task tag assignments)
 * - v4_tasks (task records)
 * - v4_task_statuses (task status master)
 * - v4_file_changes (file change history)
 * - v4_files (file master records)
 *
 * Help system cleanup:
 * - DELETE from v4_help_actions WHERE tool IN ('task', 'file')
 * - DELETE from v4_help_examples WHERE tool IN ('task', 'file')
 * - DELETE from v4_use_cases WHERE category = 'task'
 *
 * Rationale:
 * - Task management replaced by Claude Code's native TodoWrite
 * - File tracking was primarily for task status automation
 * - Simplifies codebase and reduces maintenance burden
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';

// Tables to drop in order (respecting foreign key dependencies)
const TABLES_TO_DROP = [
  // First: all junction/detail tables with FK to v4_tasks
  'v4_task_file_links',
  'v4_task_dependencies',
  'v4_task_constraint_links',
  'v4_task_decision_links',
  'v4_task_details',
  'v4_task_pruned_files',
  'v4_task_tags',
  // Then: main task table
  'v4_tasks',
  // Then: task master table
  'v4_task_statuses',
  // File tables (v4_file_changes references v4_files)
  'v4_file_changes',
  // File master table
  'v4_files',
];

export async function up(knex: Knex): Promise<void> {
  console.error('🔄 v5.0: Dropping deprecated task and file system tables...');

  // Step 1: Clean up help system data
  console.error('\n📝 Step 1: Cleaning up help system data...');

  try {
    // Check if help tables exist before attempting cleanup
    const hasHelpActions = await knex.schema.hasTable('v4_help_actions');
    const hasHelpActionExamples = await knex.schema.hasTable('v4_help_action_examples');
    const hasHelpActionParams = await knex.schema.hasTable('v4_help_action_params');

    if (hasHelpActions) {
      // Get action IDs for task/file tools (to cascade delete related records)
      const taskFileActionIds = await knex('v4_help_actions')
        .whereIn('tool_name', ['task', 'file'])
        .pluck('id');

      if (taskFileActionIds.length > 0) {
        // Delete related examples first (FK dependency)
        if (hasHelpActionExamples) {
          const deletedExamples = await knex('v4_help_action_examples')
            .whereIn('action_id', taskFileActionIds)
            .delete();
          console.error(`  ✓ Deleted ${deletedExamples} help examples for task/file tools`);
        }

        // Delete related params (FK dependency)
        if (hasHelpActionParams) {
          const deletedParams = await knex('v4_help_action_params')
            .whereIn('action_id', taskFileActionIds)
            .delete();
          console.error(`  ✓ Deleted ${deletedParams} help params for task/file tools`);
        }

        // Now delete the actions themselves
        const deletedActions = await knex('v4_help_actions')
          .whereIn('tool_name', ['task', 'file'])
          .delete();
        console.error(`  ✓ Deleted ${deletedActions} help actions for task/file tools`);
      } else {
        console.error(`  ℹ No task/file help actions found, skipping`);
      }
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ⚠️  Help system cleanup warning: ${errorMsg}`);
  }

  // Step 2: Drop tables
  console.error('\n📝 Step 2: Dropping tables...');

  for (const tableName of TABLES_TO_DROP) {
    try {
      const exists = await knex.schema.hasTable(tableName);
      if (exists) {
        await knex.schema.dropTable(tableName);
        console.error(`  ✓ Dropped table: ${tableName}`);
      } else {
        console.error(`  ⚠️  Table ${tableName} does not exist, skipping`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message?.toLowerCase() : String(error).toLowerCase();
      // Ignore "does not exist" errors (different messages per DB)
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown table') ||
        errorMsg.includes('no such table')
      ) {
        console.error(`  ⚠️  Table ${tableName} does not exist, skipping`);
      } else {
        throw error;
      }
    }
  }

  console.error('\n✅ Task and file system tables dropped successfully');
  console.error('📝 Task management: Use Claude Code\'s native TodoWrite');
  console.error('📝 Remaining tools: decision, constraint, help, example, use_case, suggest');
}

export async function down(knex: Knex): Promise<void> {
  console.error('⚠️  WARNING: Task and file tables will NOT be recreated');
  console.error('   These features have been deprecated and removed in v5.0');
  console.error('   Use Claude Code\'s native TodoWrite for task management');
  console.error('');
  console.error('   If you need to restore, run the bootstrap migration fresh:');
  console.error('   - Create new database');
  console.error('   - Run migrations from v4.0');
}
