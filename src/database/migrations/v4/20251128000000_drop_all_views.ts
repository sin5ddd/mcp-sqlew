/**
 * v4.0.1: Drop all database views
 *
 * Problem:
 * - Database views cause migration complexity across different database engines
 * - Views require database-specific SQL syntax (datetime functions, string aggregation)
 * - Architectural decision: No views in v4+ schema - use JOINs instead
 *
 * Solution:
 * - Drop all legacy views that may exist from v3 migrations
 * - Tool files use JOIN queries via Knex query builder (cross-DB compatible)
 * - Reference: src/utils/view-queries.ts for equivalent JOIN-based queries
 *
 * Related files updated:
 * - src/tools/constraints/actions/get.ts - Now uses JOINs
 * - src/tools/files/actions/get.ts - Now uses JOINs
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';

// All possible views from v3 schema that may still exist
const VIEWS_TO_DROP = [
  // v3 views
  'v_tagged_decisions',
  'v_active_context',
  'v_layer_summary',
  'v_unread_messages_by_priority',
  'v_recent_file_changes',
  'v_tagged_constraints',
  'v_task_board',
  // v4 prefixed views (in case any were accidentally created)
  'v4_tagged_decisions',
  'v4_active_context',
  'v4_layer_summary',
  'v4_recent_file_changes',
  'v4_tagged_constraints',
  'v4_task_board',
];

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Dropping all database views (v4.0.1 - No views policy)...');

  for (const viewName of VIEWS_TO_DROP) {
    try {
      await knex.raw(`DROP VIEW IF EXISTS ${viewName}`);
      console.log(`  ✓ Dropped view: ${viewName}`);
    } catch (error: any) {
      // Ignore errors if view doesn't exist (different error messages per DB)
      const errorMsg = error.message?.toLowerCase() || '';
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown') ||
        errorMsg.includes('no such')
      ) {
        console.log(`  ⚠️  View ${viewName} does not exist, skipping`);
      } else {
        throw error;
      }
    }
  }

  console.log('✅ All views dropped successfully');
  console.log('📝 Policy: No views in v4+ - use JOIN queries via Knex query builder');
}

export async function down(knex: Knex): Promise<void> {
  console.log('⚠️  WARNING: Views will NOT be recreated');
  console.log('   v4+ policy: No database views - use JOINs instead');
  console.log('   Reference: src/utils/view-queries.ts for equivalent queries');
}
