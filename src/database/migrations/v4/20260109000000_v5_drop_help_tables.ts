/**
 * v5.0: Drop help system database tables
 *
 * This migration removes all help/example/use_case database tables.
 * Help documentation is now stored in TOML files (src/help-data/)
 * and loaded by HelpSystemLoader at runtime.
 *
 * Tables dropped (in FK dependency order):
 * - t_help_action_sequences (FK to t_help_use_cases, m_help_actions)
 * - t_help_action_examples (FK to m_help_actions)
 * - t_help_action_params (FK to m_help_actions)
 * - t_help_use_cases (FK to m_help_use_case_cats)
 * - m_help_actions (FK to m_help_tools)
 * - m_help_use_case_cats (no FK)
 * - m_help_tools (no FK)
 *
 * Rationale:
 * - Help data is now version-controlled in TOML files
 * - Easier to maintain and review changes via git
 * - No DB dependencies for documentation
 * - Reduces DB complexity (7 fewer tables)
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';

// Tables to drop in order (respecting foreign key dependencies)
const TABLES_TO_DROP = [
  // First: junction tables with multiple FKs
  't_help_action_sequences',
  // Then: transaction tables with single FK
  't_help_action_examples',
  't_help_action_params',
  't_help_use_cases',
  // Then: master tables (actions depends on tools)
  'm_help_actions',
  'm_help_use_case_cats',
  // Finally: root master table
  'm_help_tools',
];

export async function up(knex: Knex): Promise<void> {
  console.error('🔄 v5.0: Dropping help system database tables...');
  console.error('   Help documentation is now stored in TOML files (src/help-data/)');

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

  console.error('\n✅ Help system tables dropped successfully');
  console.error('📝 Help documentation: src/help-data/*.toml');
  console.error('📝 Loader: HelpSystemLoader (src/help-loader.ts)');
}

export async function down(knex: Knex): Promise<void> {
  console.error('⚠️  WARNING: Help tables will NOT be recreated');
  console.error('   Help documentation is now stored in TOML files');
  console.error('   See: src/help-data/*.toml');
  console.error('');
  console.error('   If you need to restore DB-based help:');
  console.error('   - Revert to an earlier version');
  console.error('   - Run the bootstrap migration fresh');
}
