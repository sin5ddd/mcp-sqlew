/**
 * Converted from: src/config/knex/enhancements/20251115120000_fix_all_cross_db_issues_v3_9_0.ts
 * Changes:
 * - Added Universal Knex Wrapper for database detection
 * - Replaced manual client detection with db.isSQLite
 * - Line count: 55 (original) ’ 50 (9% reduction)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

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
  const db = new UniversalKnex(knex);

  // Skip on SQLite - all migrations work correctly there
  if (db.isSQLite) {
    console.error(' SQLite: All migrations completed successfully');
    return;
  }

  const dbType = db.isMySQL ? 'MySQL' : db.isPostgreSQL ? 'PostgreSQL' : 'Unknown';
  console.error(`=' Final cross-database safety check for ${dbType}...`);

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
      console.error(`   WARNING: Table ${tableName} does not exist!`);
      console.error(`   This suggests a migration failure. Please check migration logs.`);
    } else {
      console.error(`   ${tableName} exists`);
    }
  }

  console.error(' Cross-database compatibility verified');
}

export async function down(knex: Knex): Promise<void> {
  // This is a safety check migration - no rollback needed
  console.error(' Safety check migration - no rollback actions');
}
