/**
 * Converted from: src/config/knex/enhancements/20251112000002_fix_task_pruned_files_schema_v3_9_0.ts
 * Line count: 131 → 96 (27% reduction)
 *
 * Enhancement: Fix t_task_pruned_files schema for v3.9.0
 *
 * Problem: The v3.9.0 migration creates t_task_pruned_files with project_id,
 * but if the table was already created by v3.5 migration (without project_id),
 * the v3.9.0 migration skips table creation, leaving the schema incomplete.
 * Additionally, SQLite does NOT support adding FK constraints via ALTER TABLE.
 *
 * Solution: Use drop-and-recreate pattern to add project_id and linked_decision_key_id
 * with proper foreign key constraints (same approach as 20251112000001).
 *
 * This enhancement ensures compatibility with databases upgraded from v3.5.x
 * that already have t_task_pruned_files table without these columns.
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite Compatible: Uses drop-recreate instead of ALTER TABLE ADD CONSTRAINT.
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);
  console.log('🔄 Checking t_task_pruned_files schema...');

  const hasTable = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasTable) {
    console.log('⚠️  t_task_pruned_files table does not exist, skipping');
    return;
  }

  // Check if columns exist
  const hasProjectId = await knex.schema.hasColumn('t_task_pruned_files', 'project_id');
  const hasLinkedDecision = await knex.schema.hasColumn('t_task_pruned_files', 'linked_decision_key_id');

  if (hasProjectId && hasLinkedDecision) {
    console.log('✓ Both project_id and linked_decision_key_id already exist, skipping');
    return;
  }

  console.log(`🔄 Recreating table to add missing columns with FK constraints (project_id: ${!hasProjectId}, linked_decision: ${!hasLinkedDecision})...`);

  // Step 1: Back up existing data
  const existingData = await knex('t_task_pruned_files').select('*');
  console.log(`  📊 Backing up ${existingData.length} existing rows...`);

  // Step 2: Drop old table
  await knex.schema.dropTableIfExists('t_task_pruned_files');
  console.log('  ✓ Dropped old table');

  // Step 3: Recreate with complete schema (matching 20251112000000 migration spec)
  await db.createTableSafe('t_task_pruned_files', (table, helpers) => {
    table.increments('id').primary();
    table.integer('task_id').notNullable()
      .references('id').inTable('t_tasks').onDelete('CASCADE');
    table.string('file_path', 500).notNullable();

    // Use wrapper's timestampColumn for cross-DB default
    helpers.timestampColumn('pruned_ts');

    table.integer('linked_decision_key_id').nullable()
      .references('id').inTable('m_context_keys').onDelete('SET NULL');
    table.integer('project_id').notNullable()
      .references('id').inTable('m_projects').onDelete('CASCADE');

    table.index('task_id', 'idx_task_pruned_files_task_id');
  });
  console.log('  ✓ Created new table with complete schema and FK constraints');

  // Step 4: Restore data with default values for new columns
  if (existingData.length > 0) {
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const dataToInsert = existingData.map(row => ({
      id: row.id,
      task_id: row.task_id,
      file_path: row.file_path,
      pruned_ts: row.pruned_ts || currentTimestamp,
      linked_decision_key_id: row.linked_decision_key_id || null,
      project_id: row.project_id || 1, // Default to project 1 if missing
    }));

    await knex('t_task_pruned_files').insert(dataToInsert);
    console.log(`  ✓ Restored ${dataToInsert.length} rows with FK constraints`);
  }

  console.log('✅ t_task_pruned_files schema fix completed');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);
  console.log('🔄 Rolling back t_task_pruned_files schema fix...');

  const hasTable = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasTable) {
    console.log('⚠️  t_task_pruned_files table does not exist, skipping');
    return;
  }

  // Back up existing data
  const existingData = await knex('t_task_pruned_files').select('*');
  console.log(`  📊 Backing up ${existingData.length} existing rows...`);

  // Drop table
  await knex.schema.dropTableIfExists('t_task_pruned_files');

  // Recreate with old schema (without project_id and linked_decision_key_id)
  await db.createTableSafe('t_task_pruned_files', (table, helpers) => {
    table.increments('id').primary();
    table.integer('task_id').notNullable()
      .references('id').inTable('t_tasks').onDelete('CASCADE');
    table.string('file_path', 500).notNullable();
    helpers.timestampColumn('pruned_ts');

    table.index('task_id', 'idx_task_pruned_files_task_id');
  });

  // Restore data (omit project_id and linked_decision_key_id)
  if (existingData.length > 0) {
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const dataToInsert = existingData.map(row => ({
      id: row.id,
      task_id: row.task_id,
      file_path: row.file_path,
      pruned_ts: row.pruned_ts || currentTimestamp,
    }));

    await knex('t_task_pruned_files').insert(dataToInsert);
    console.log(`  ✓ Restored ${dataToInsert.length} rows`);
  }

  console.log('✅ t_task_pruned_files schema fix rollback completed');
}
