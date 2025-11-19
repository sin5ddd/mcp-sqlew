import type { Knex } from "knex";

/**
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

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';
  const isMySQL = client === 'mysql2' || client === 'mysql';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  // Skip on SQLite - original migration works fine there
  if (isSQLite) {
    console.log('✓ SQLite: Original migration already handled timestamps correctly');
    return;
  }

  console.log(`🔧 Fixing cross-database timestamp issues for ${client}...`);

  // ============================================================================
  // Fix t_decision_policies table
  // ============================================================================
  const hasPoliciesTable = await knex.schema.hasTable('t_decision_policies');

  if (hasPoliciesTable) {
    const hasProjectId = await knex.schema.hasColumn('t_decision_policies', 'project_id');
    const hasCreatedBy = await knex.schema.hasColumn('t_decision_policies', 'created_by');
    const hasTs = await knex.schema.hasColumn('t_decision_policies', 'ts');

    if (!hasProjectId || !hasCreatedBy || !hasTs) {
      console.log('  ⏭️  Adding missing columns to t_decision_policies...');

      await knex.schema.alterTable('t_decision_policies', (table) => {
        if (!hasProjectId) {
          table.integer('project_id').notNullable().defaultTo(1);
        }
        if (!hasCreatedBy) {
          table.integer('created_by').nullable();
        }
        if (!hasTs) {
          // Add as nullable first, then populate and make NOT NULL
          table.integer('ts').nullable();
        }
      });

      // Populate ts column with current timestamp if it was just created
      if (!hasTs) {
        const currentTs = Math.floor(Date.now() / 1000);
        await knex('t_decision_policies').update({ ts: currentTs });

        // Make ts NOT NULL
        if (isMySQL) {
          await knex.raw('ALTER TABLE t_decision_policies MODIFY ts INT NOT NULL');
        } else if (isPostgreSQL) {
          await knex.raw('ALTER TABLE t_decision_policies ALTER COLUMN ts SET NOT NULL');
        }
      }

      console.log('  ✅ Fixed t_decision_policies columns');
    } else {
      console.log('  ✓ t_decision_policies already has required columns');
    }
  }

  // ============================================================================
  // Fix t_decision_pruning_log table
  // ============================================================================
  const hasPruningLog = await knex.schema.hasTable('t_decision_pruning_log');

  if (!hasPruningLog) {
    console.log('  ⏭️  Creating t_decision_pruning_log table...');

    await knex.schema.createTable('t_decision_pruning_log', (table) => {
      table.increments('id').primary();
      table.integer('original_decision_id').notNullable();
      table.string('original_key', 256).notNullable();
      table.text('original_value').notNullable();
      table.integer('original_version').notNullable();
      table.bigInteger('original_ts').notNullable();
      table.integer('project_id').notNullable().defaultTo(1);
      // Add pruned_ts as nullable first
      table.bigInteger('pruned_ts').nullable();
    });

    // Populate pruned_ts with current timestamp
    const currentTs = Math.floor(Date.now() / 1000);
    await knex('t_decision_pruning_log').update({ pruned_ts: currentTs });

    // Make pruned_ts NOT NULL
    if (isMySQL) {
      await knex.raw('ALTER TABLE t_decision_pruning_log MODIFY pruned_ts BIGINT NOT NULL');
    } else if (isPostgreSQL) {
      await knex.raw('ALTER TABLE t_decision_pruning_log ALTER COLUMN pruned_ts SET NOT NULL');
    }

    console.log('  ✅ Created t_decision_pruning_log table');
  } else {
    console.log('  ✓ t_decision_pruning_log already exists');
  }

  // ============================================================================
  // Fix m_tag_index table
  // ============================================================================
  const hasTagIndex = await knex.schema.hasTable('m_tag_index');

  if (!hasTagIndex) {
    console.log('  ⏭️  Creating m_tag_index table...');

    await knex.schema.createTable('m_tag_index', (table) => {
      // Use VARCHAR(191) instead of TEXT for PRIMARY KEY (MySQL/MariaDB requirement)
      table.string('tag_name', 191).notNullable();
      table.integer('decision_count').notNullable().defaultTo(0);
      table.integer('constraint_count').notNullable().defaultTo(0);
      table.integer('task_count').notNullable().defaultTo(0);
      table.integer('total_count').notNullable().defaultTo(0);
      table.primary(['tag_name']);
    });

    console.log('  ✅ Created m_tag_index table');
  } else {
    console.log('  ✓ m_tag_index already exists');
  }

  console.log('✅ Cross-database timestamp fixes applied successfully');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  if (isSQLite) {
    console.log('✓ SQLite: No rollback needed');
    return;
  }

  // This migration is a hotfix, so down() should not break the database
  // We'll just log what we would do but not actually drop columns/tables
  console.log('⚠️  Hotfix migration rollback: Not dropping columns/tables to preserve data');
  console.log('   If you need to rollback, manually drop the columns/tables:');
  console.log('   - t_decision_policies: project_id, created_by, ts');
  console.log('   - t_decision_pruning_log: entire table');
  console.log('   - m_tag_index: entire table');
}
