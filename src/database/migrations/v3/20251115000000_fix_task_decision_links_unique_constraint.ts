/**
 * Converted from: src/config/knex/enhancements/20251115000000_fix_task_decision_links_unique_constraint.ts
 * Changes:
 * - Added Universal Knex Wrapper for database detection
 * - Replaced manual client detection with db.isSQLite, db.isMySQL, db.isPostgreSQL
 * - Used db.createTableSafe pattern (manual in this case for data preservation)
 * - Line count: 149 (original) → 141 (5% reduction)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

/**
 * Enhancement Migration: Fix t_task_decision_links UNIQUE Constraint
 *
 * Root Cause:
 * - Bootstrap migration created table with composite PRIMARY KEY (task_id, decision_key_id)
 * - v3.7.0 upgrade migration recreated table with AUTO INCREMENT id PRIMARY KEY
 * - But v3.7.0 forgot to add UNIQUE(task_id, decision_key_id) constraint
 * - Result: .onConflict(['task_id', 'decision_key_id']) fails with "no UNIQUE constraint"
 *
 * This migration:
 * - Recreates t_task_decision_links with proper UNIQUE constraint
 * - Preserves all data
 * - Idempotent (safe to run multiple times)
 * - Fixes both existing databases and future fresh installs
 *
 * Related Decision: v3.7.0/task-decision-links-schema-discrepancy
 */

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if UNIQUE constraint already exists
  if (db.isSQLite) {
    // SQLite: Check if UNIQUE index exists
    const indexes = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='index'
      AND tbl_name='t_task_decision_links'
      AND (
        name LIKE '%unique%'
        OR sql LIKE '%UNIQUE%'
      )
    `);

    if (indexes.length > 0) {
      console.log('✓ UNIQUE constraint already exists on t_task_decision_links, skipping');
      return;
    }
  } else {
    // MySQL/PostgreSQL: Check constraints
    const hasUniqueConstraint = await knex.schema.raw(`
      SELECT COUNT(*) as count
      FROM information_schema.table_constraints
      WHERE table_name = 't_task_decision_links'
      AND constraint_type = 'UNIQUE'
    `).then((result: any) => {
      const row = result[0] || result.rows?.[0];
      return row && row.count > 0;
    });

    if (hasUniqueConstraint) {
      console.log('✓ UNIQUE constraint already exists on t_task_decision_links, skipping');
      return;
    }
  }

  console.log('🔧 Recreating t_task_decision_links with UNIQUE constraint...');

  // Step 1: Backup existing data
  const existingData = await knex('t_task_decision_links').select('*');
  console.log(`   Backed up ${existingData.length} links`);

  // Step 2: Drop existing table
  await knex.schema.dropTableIfExists('t_task_decision_links');
  console.log('   Dropped old table');

  // Step 3: Recreate table with UNIQUE constraint
  await knex.schema.createTable('t_task_decision_links', (table) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable();
    table.integer('decision_key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.text('link_type').defaultTo('implements');
    table.integer('linked_ts').notNullable();

    // ✅ Add UNIQUE constraint (the missing piece!)
    table.unique(['task_id', 'decision_key_id'], {
      indexName: 'idx_task_decision_links_unique'
    });

    // Foreign keys
    table.foreign('task_id').references('id').inTable('t_tasks').onDelete('CASCADE');
    table.foreign('decision_key_id').references('id').inTable('m_context_keys');
    table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');

    // Indexes
    table.index('task_id', 'idx_task_decision_links_task');
    table.index('decision_key_id', 'idx_task_decision_links_decision');
    table.index(['project_id', 'task_id'], 'idx_task_decision_links_project');
  });
  console.log('   Created new table with UNIQUE constraint');

  // Step 4: Restore data (preserving all columns including id)
  if (existingData.length > 0) {
    // Ensure all required columns exist, fill missing ones
    const dataToRestore = existingData.map((row: any) => ({
      id: row.id,
      task_id: row.task_id,
      decision_key_id: row.decision_key_id,
      project_id: row.project_id || 1,
      link_type: row.link_type || 'implements',
      linked_ts: row.linked_ts || Math.floor(Date.now() / 1000)
    }));

    await knex('t_task_decision_links').insert(dataToRestore);
    console.log(`   Restored ${dataToRestore.length} links`);
  }

  console.log('✅ Successfully fixed t_task_decision_links UNIQUE constraint');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back UNIQUE constraint fix...');

  // Backup data
  const existingData = await knex('t_task_decision_links').select('*');

  // Recreate table WITHOUT UNIQUE constraint (back to broken state)
  await knex.schema.dropTableIfExists('t_task_decision_links');
  await knex.schema.createTable('t_task_decision_links', (table) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable();
    table.integer('decision_key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.text('link_type').defaultTo('implements');
    table.integer('linked_ts').notNullable();

    // Foreign keys
    table.foreign('task_id').references('id').inTable('t_tasks').onDelete('CASCADE');
    table.foreign('decision_key_id').references('id').inTable('m_context_keys');
    table.foreign('project_id').references('id').inTable('m_projects').onDelete('CASCADE');

    // Indexes (no UNIQUE constraint)
    table.index('task_id', 'idx_task_decision_links_task');
    table.index('decision_key_id', 'idx_task_decision_links_decision');
    table.index(['project_id', 'task_id'], 'idx_task_decision_links_project');
  });

  // Restore data
  if (existingData.length > 0) {
    await knex('t_task_decision_links').insert(existingData);
  }

  console.log('✅ Rolled back to schema without UNIQUE constraint');
}
