/**
 * v3.9.0: Eliminate database views for cross-database compatibility
 *
 * Problem:
 * - Knex.js doesn't handle views well across different database engines
 * - View creation SQL is database-specific (datetime functions, string aggregation, etc.)
 * - Migration failures on MySQL/MariaDB/PostgreSQL due to view syntax differences
 *
 * Solution:
 * - Drop all 7 views (v_tagged_decisions, v_active_context, v_layer_summary,
 *   v_unread_messages_by_priority, v_recent_file_changes, v_tagged_constraints, v_task_board)
 * - Replace with cross-database query functions in src/utils/view-queries.ts
 * - Tool files updated to use query functions instead of querying views
 *
 * Related files updated:
 * - src/utils/view-queries.ts - Refactored for cross-DB compatibility using UniversalKnex
 * - src/utils/universal-knex.ts - Added dateFunction(), boolTrue(), boolFalse() helpers
 * - src/tools/context/actions/{get,list,search-tags,search-layer,search-advanced}.ts
 * - src/tools/tasks/actions/list.ts
 *
 * Architectural decision: testing/eliminate-database-views-v3.9.0
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';

const VIEWS_TO_DROP = [
  'v_tagged_decisions',
  'v_active_context',
  'v_layer_summary',
  'v_unread_messages_by_priority',
  'v_recent_file_changes',
  'v_tagged_constraints',
  'v_task_board',
];

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Eliminating database views for cross-database compatibility (v3.9.0)...');

  for (const viewName of VIEWS_TO_DROP) {
    try {
      await knex.raw(`DROP VIEW IF EXISTS ${viewName}`);
      console.log(`  ✓ Dropped view: ${viewName}`);
    } catch (error: any) {
      // Ignore errors if view doesn't exist
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('does not exist') || errorMsg.includes('unknown')) {
        console.log(`  ⚠️  View ${viewName} does not exist, skipping`);
      } else {
        throw error;
      }
    }
  }

  console.log('✅ All views eliminated successfully');
  console.log('📝 Tool files now use cross-database query functions from src/utils/view-queries.ts');
}

export async function down(knex: Knex): Promise<void> {
  console.log('⚠️  WARNING: Cannot recreate views in down() migration');
  console.log('   Views had database-specific syntax that caused cross-DB issues');
  console.log('   Use query functions from src/utils/view-queries.ts instead');
  console.log('   If you absolutely need views, restore from v3.8.x backup');
}
