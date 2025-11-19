import type { Knex } from "knex";

/**
 * Migration: Pre-emptive Cross-Database Compatibility Fix (v3.9.0)
 *
 * Purpose: This migration runs BEFORE 20251112000000_decision_intelligence_v3_9_0.ts
 * to add problematic columns with database-aware syntax.
 *
 * Problem: The original migration uses SQLite-specific strftime('%s', 'now')
 * which fails on PostgreSQL/MySQL.
 *
 * Solution: Add the columns here with proper cross-database syntax, then the
 * original migration will detect them and skip (due to hasColumn checks).
 *
 * Note: This is a hotfix migration. We cannot edit the pushed upgrade migration.
 * Timestamp 20251111235959 ensures this runs just before 20251112000000.
 */

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Only run on MySQL/PostgreSQL - let original migration handle SQLite
  if (isSQLite) {
    console.log('✓ SQLite: Skipping pre-emptive fix (original migration works fine)');
    return;
  }

  console.log(`🔧 Pre-emptive cross-database fix for ${client}...`);

  // ============================================================================
  // Pre-fix t_decision_policies columns (before 20251112000000 runs)
  // ============================================================================

  const hasPoliciesTable = await knex.schema.hasTable('t_decision_policies');

  if (!hasPoliciesTable) {
    // Create table with proper cross-database syntax (no strftime)
    console.log('  ⏭️  Pre-creating t_decision_policies table...');

    const currentTs = Math.floor(Date.now() / 1000);

    await knex.schema.createTable('t_decision_policies', (table) => {
      table.increments('id').primary();
      table.string('name', 200).notNullable();
      table.integer('project_id').notNullable().references('id').inTable('m_projects').onDelete('CASCADE');
      table.text('description');
      table.text('defaults'); // JSON
      table.text('required_fields'); // JSON
      table.integer('created_by').nullable().references('id').inTable('m_agents').onDelete('SET NULL');
      table.integer('ts').notNullable().defaultTo(currentTs);

      // UNIQUE constraint on (name, project_id)
      table.unique(['name', 'project_id']);
    });

    console.log('  ✅ Pre-created t_decision_policies table');
  } else {
    const hasProjectId = await knex.schema.hasColumn('t_decision_policies', 'project_id');
    const hasCreatedBy = await knex.schema.hasColumn('t_decision_policies', 'created_by');
    const hasTs = await knex.schema.hasColumn('t_decision_policies', 'ts');

    if (!hasProjectId || !hasCreatedBy || !hasTs) {
      console.log('  ⏭️  Pre-adding columns to t_decision_policies...');

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

        // Make ts NOT NULL with database-specific syntax
        const isMySQL = client === 'mysql2' || client === 'mysql';
        const isPostgreSQL = client === 'pg' || client === 'postgresql';

        if (isMySQL) {
          await knex.raw('ALTER TABLE t_decision_policies MODIFY ts INT NOT NULL');
        } else if (isPostgreSQL) {
          await knex.raw('ALTER TABLE t_decision_policies ALTER COLUMN ts SET NOT NULL');
        }
      }

      console.log('  ✅ Pre-added columns to t_decision_policies');
    } else {
      console.log('  ✓ Columns already exist, skipping');
    }
  }

  // ============================================================================
  // Pre-create m_tag_index table (with VARCHAR instead of TEXT)
  // ============================================================================

  const hasTagIndex = await knex.schema.hasTable('m_tag_index');

  if (!hasTagIndex) {
    console.log('  ⏭️  Pre-creating m_tag_index table...');

    await knex.schema.createTable('m_tag_index', (table) => {
      // Use VARCHAR(191) instead of TEXT for PRIMARY KEY (MySQL/MariaDB requirement)
      table.string('tag_name', 191).notNullable();
      table.integer('decision_count').notNullable().defaultTo(0);
      table.integer('constraint_count').notNullable().defaultTo(0);
      table.integer('task_count').notNullable().defaultTo(0);
      table.integer('total_count').notNullable().defaultTo(0);
      table.primary(['tag_name']);
    });

    console.log('  ✅ Pre-created m_tag_index table');
  } else {
    console.log('  ✓ m_tag_index already exists');
  }

  // ============================================================================
  // Pre-create t_decision_pruning_log table
  // ============================================================================

  const hasPruningLog = await knex.schema.hasTable('t_decision_pruning_log');

  if (!hasPruningLog) {
    console.log('  ⏭️  Pre-creating t_decision_pruning_log table...');

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

    // Populate pruned_ts with current timestamp (if table just created, no rows yet)
    // This is for future rows - current table is empty
    const isMySQL = client === 'mysql2' || client === 'mysql';
    const isPostgreSQL = client === 'pg' || client === 'postgresql';

    // Make pruned_ts NOT NULL
    if (isMySQL) {
      await knex.raw('ALTER TABLE t_decision_pruning_log MODIFY pruned_ts BIGINT NOT NULL');
    } else if (isPostgreSQL) {
      await knex.raw('ALTER TABLE t_decision_pruning_log ALTER COLUMN pruned_ts SET NOT NULL');
    }

    console.log('  ✅ Pre-created t_decision_pruning_log table');
  } else {
    console.log('  ✓ t_decision_pruning_log already exists');
  }

  // ============================================================================
  // Pre-create t_task_pruned_files table
  // ============================================================================

  const hasPrunedFilesTable = await knex.schema.hasTable('t_task_pruned_files');

  if (!hasPrunedFilesTable) {
    console.log('  ⏭️  Pre-creating t_task_pruned_files table...');

    await knex.schema.createTable('t_task_pruned_files', (table) => {
      table.increments('id').primary();
      table.integer('task_id').notNullable()
        .references('id').inTable('t_tasks').onDelete('CASCADE');
      table.string('file_path', 500).notNullable();
      table.bigInteger('pruned_ts').notNullable().defaultTo(Math.floor(Date.now() / 1000));
      table.integer('linked_decision_key_id').nullable()
        .references('id').inTable('m_context_keys').onDelete('SET NULL');
      table.integer('project_id').notNullable()
        .references('id').inTable('m_projects').onDelete('CASCADE');

      // UNIQUE constraint on (task_id, file_path)
      table.unique(['task_id', 'file_path']);
    });

    console.log('  ✅ Pre-created t_task_pruned_files table');
  } else {
    console.log('  ✓ t_task_pruned_files already exists');
  }

  // ============================================================================
  // Pre-create system agent (to prevent INSERT destructuring error)
  // ============================================================================

  const systemAgent = await knex('m_agents').where('name', 'system').first();

  if (!systemAgent) {
    console.log('  ⏭️  Pre-creating system agent...');

    const isMySQL = client === 'mysql2' || client === 'mysql';
    const isPostgreSQL = client === 'pg' || client === 'postgresql';

    if (isPostgreSQL || isMySQL) {
      // Use returning() for databases that support it
      await knex('m_agents').insert({
        name: 'system',
        last_active_ts: Math.floor(Date.now() / 1000)
      });
    }

    console.log('  ✅ Pre-created system agent');
  } else {
    console.log('  ✓ System agent already exists');
  }

  console.log('✅ Pre-emptive cross-database fix completed successfully');
  console.log('   Original migration will detect these changes and skip problematic steps');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  if (isSQLite) {
    console.log('✓ SQLite: No rollback needed');
    return;
  }

  // This is a pre-emptive hotfix, so down() should not break the database
  console.log('⚠️  Pre-emptive fix rollback: Not dropping columns/tables to preserve data');
  console.log('   The original migration owns these structures');
}
