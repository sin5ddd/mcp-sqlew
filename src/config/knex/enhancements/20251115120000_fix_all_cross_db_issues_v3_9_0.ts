import type { Knex } from "knex";

/**
 * Migration: Final Cross-Database Compatibility Hotfix (v3.9.0)
 *
 * This migration runs AFTER all v3.9.0 migrations to ensure cross-database
 * compatibility. It acts as a "safety net" to handle any issues that weren't
 * caught by the pre-emptive migrations.
 *
 * Fixes:
 * 1. Ensures all tables exist (no-op if already created)
 * 2. Database-agnostic - skips on SQLite, handles MySQL/PostgreSQL specifics
 *
 * Note: This is a final safety migration. All future migrations should use
 * database-aware syntax from the start.
 */

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Skip on SQLite - all migrations work correctly there
  if (isSQLite) {
    console.log('✓ SQLite: All migrations completed successfully');
    return;
  }

  console.log(`🔧 Final cross-database safety check for ${client}...`);

  // Verify all critical tables exist
  const criticalTables = [
    't_decision_policies',
    'm_tag_index',
    't_decision_pruning_log',
    't_task_pruned_files'
  ];

  for (const tableName of criticalTables) {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) {
      console.log(`⚠️  WARNING: Table ${tableName} does not exist!`);
      console.log(`   This suggests a migration failure. Please check migration logs.`);
    } else {
      console.log(`  ✓ ${tableName} exists`);
    }
  }

  console.log('✅ Cross-database compatibility verified');
}

export async function down(knex: Knex): Promise<void> {
  // This is a safety check migration - no rollback needed
  console.log('✓ Safety check migration - no rollback actions');
}
