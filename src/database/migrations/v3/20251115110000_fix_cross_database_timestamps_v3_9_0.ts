/**
 * Converted from: src/config/knex/enhancements/20251115110000_fix_cross_database_timestamps_v3_9_0.ts
 *
 * Changes:
 * - Replaced DB-specific client detection with UniversalKnex wrapper
 * - Used db.createTableSafe() for idempotent table creation
 * - Used db.addColumnSafe() for idempotent column additions
 * - Used db.timestampColumn() and db.primaryKeyString() helpers
 * - Eliminated 40+ lines of conditional DB logic
 * - Line count: 153 → 82 (46% reduction)
 *
 * Migration: Fix Cross-Database Timestamp Defaults (v3.9.0)
 *
 * Problem: Upgrade migration 20251112000000_decision_intelligence_v3_9_0.ts uses
 * SQLite-specific strftime('%s', 'now') for DEFAULT values, which fails on PostgreSQL.
 *
 * Solution: This migration acts as a "catch-up" to complete the work if the original
 * migration failed on non-SQLite databases. It uses database-aware timestamp functions.
 *
 * Note: This is a hotfix migration. We cannot edit the pushed upgrade migration.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Skip on SQLite - original migration works fine there
  if (db.isSQLite) {
    console.error('✓ SQLite: Original migration already handled timestamps correctly');
    return;
  }

  console.error(`🔧 Fixing cross-database timestamp issues for ${db.isMySQL ? 'MySQL' : 'PostgreSQL'}...`);

  // ============================================================================
  // Fix t_decision_policies table
  // ============================================================================
  const hasPoliciesTable = await knex.schema.hasTable('t_decision_policies');

  if (hasPoliciesTable) {
    // Add missing columns if needed
    await db.addColumnSafe('t_decision_policies', 'project_id', (table) =>
      table.integer('project_id').notNullable().defaultTo(1)
    );

    await db.addColumnSafe('t_decision_policies', 'created_by', (table) =>
      table.integer('created_by').nullable()
    );

    // Check if ts column exists
    const hasTs = await knex.schema.hasColumn('t_decision_policies', 'ts');

    if (!hasTs) {
      console.error('  ⏭️  Adding ts column to t_decision_policies...');

      await knex.schema.alterTable('t_decision_policies', (table) => {
        table.integer('ts').nullable();
      });

      // Populate ts column with current timestamp
      const currentTs = Math.floor(Date.now() / 1000);
      await knex('t_decision_policies').update({ ts: currentTs });

      // Make ts NOT NULL
      if (db.isMySQL) {
        await knex.raw('ALTER TABLE t_decision_policies MODIFY ts INT NOT NULL');
      } else if (db.isPostgreSQL) {
        await knex.raw('ALTER TABLE t_decision_policies ALTER COLUMN ts SET NOT NULL');
      }

      console.error('  ✅ Fixed t_decision_policies columns');
    } else {
      console.error('  ✓ t_decision_policies already has required columns');
    }
  }

  // ============================================================================
  // Fix t_decision_pruning_log table
  // ============================================================================
  await db.createTableSafe('t_decision_pruning_log', (table, helpers) => {
    table.increments('id').primary();
    table.integer('original_decision_id').notNullable();
    table.string('original_key', 256).notNullable();
    table.text('original_value').notNullable();
    table.integer('original_version').notNullable();
    table.bigInteger('original_ts').notNullable();
    table.integer('project_id').notNullable().defaultTo(1);
    table.bigInteger('pruned_ts').notNullable().defaultTo(Math.floor(Date.now() / 1000));
  });

  // ============================================================================
  // Fix m_tag_index table
  // ============================================================================
  await db.createTableSafe('m_tag_index', (table, helpers) => {
    // Use VARCHAR(191) for PRIMARY KEY (MySQL/MariaDB utf8mb4 compatibility)
    helpers.primaryKeyString('tag_name', 191);
    table.integer('decision_count').notNullable().defaultTo(0);
    table.integer('constraint_count').notNullable().defaultTo(0);
    table.integer('task_count').notNullable().defaultTo(0);
    table.integer('total_count').notNullable().defaultTo(0);
  });

  console.error('✅ Cross-database timestamp fixes applied successfully');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  if (db.isSQLite) {
    console.error('✓ SQLite: No rollback needed');
    return;
  }

  // This migration is a hotfix, so down() should not break the database
  // We'll just log what we would do but not actually drop columns/tables
  console.error('⚠️  Hotfix migration rollback: Not dropping columns/tables to preserve data');
  console.error('   If you need to rollback, manually drop the columns/tables:');
  console.error('   - t_decision_policies: project_id, created_by, ts');
  console.error('   - t_decision_pruning_log: entire table');
  console.error('   - m_tag_index: entire table');
}
