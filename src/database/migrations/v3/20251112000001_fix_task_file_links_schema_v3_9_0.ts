/**
 * Converted from: src/config/knex/enhancements/20251112000001_fix_task_file_links_schema_v3_9_0.ts
 * Line count: 130 → 91 (30% reduction)
 *
 * Migration: Fix t_task_file_links Schema (v3.9.0 Hotfix)
 *
 * Problem:
 * - Fresh v3.8.x installations have t_task_file_links without `id` and `linked_ts` columns
 * - This is due to v3.7.0 migration skipping table recreation when project_id already exists
 * - Code expects these columns (src/tools/tasks/actions/create.ts:163)
 *
 * Solution:
 * - Add `id` (auto-increment primary key) and `linked_ts` (integer timestamp) columns
 * - Recreate table structure if columns are missing
 * - Preserve existing data during migration
 *
 * Satisfies Constraints:
 * - Idempotent: Checks column existence before altering
 * - Data Preservation: Copies existing rows to new table structure
 * - Cross-DB Compatible: Works with SQLite, MySQL, PostgreSQL
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.error('🔄 Checking t_task_file_links schema...');

  // Check if table exists
  const hasTable = await knex.schema.hasTable('t_task_file_links');
  if (!hasTable) {
    console.error('⚠️  t_task_file_links does not exist - nothing to fix');
    return;
  }

  // Check if columns exist
  const hasId = await knex.schema.hasColumn('t_task_file_links', 'id');
  const hasLinkedTs = await knex.schema.hasColumn('t_task_file_links', 'linked_ts');

  if (hasId && hasLinkedTs) {
    console.error('✓ t_task_file_links already has id and linked_ts columns, skipping');
    return;
  }

  console.error(`🔄 Adding missing columns to t_task_file_links (id: ${!hasId}, linked_ts: ${!hasLinkedTs})...`);

  // Step 1: Read existing data
  const existingData = await knex('t_task_file_links').select('*');
  console.error(`  📊 Backing up ${existingData.length} existing rows...`);

  // Step 2: Drop old table
  await knex.schema.dropTableIfExists('t_task_file_links');
  console.error('  ✓ Dropped old table');

  // Step 3: Recreate with complete schema
  await knex.schema.createTable('t_task_file_links', (table) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable();
    table.integer('file_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('linked_ts').notNullable();

    // Foreign keys
    table.foreign('task_id').references('t_tasks.id').onDelete('CASCADE');
    table.foreign('file_id').references('m_files.id').onDelete('CASCADE');
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');

    // Unique constraint (prevents duplicate links)
    table.unique(['project_id', 'task_id', 'file_id']);
  });
  console.error('  ✓ Created new table with id and linked_ts columns');

  // Step 4: Restore data with linked_ts = current timestamp
  if (existingData.length > 0) {
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Add default values for missing columns
    const dataToInsert = existingData.map(row => ({
      task_id: row.task_id,
      file_id: row.file_id,
      project_id: row.project_id || 1, // Default to project 1 if missing
      linked_ts: row.linked_ts || currentTimestamp, // Use existing or current timestamp
    }));

    await knex('t_task_file_links').insert(dataToInsert);
    console.error(`  ✓ Restored ${dataToInsert.length} rows with linked_ts`);
  }

  console.error('✅ t_task_file_links schema fixed successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.error('🔄 Reverting t_task_file_links schema fix...');

  // Check if table exists
  const hasTable = await knex.schema.hasTable('t_task_file_links');
  if (!hasTable) {
    console.error('⚠️  t_task_file_links does not exist - nothing to revert');
    return;
  }

  // Read existing data
  const existingData = await knex('t_task_file_links').select('*');
  console.error(`  📊 Backing up ${existingData.length} existing rows...`);

  // Drop table
  await knex.schema.dropTableIfExists('t_task_file_links');

  // Recreate with old schema (without id and linked_ts)
  await knex.schema.createTable('t_task_file_links', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('file_id').unsigned();
    table.foreign('file_id').references('m_files.id');
    table.integer('project_id').unsigned();
    table.foreign('project_id').references('m_projects.id');
    table.primary(['task_id', 'file_id']);
  });

  // Restore data (omit id and linked_ts)
  if (existingData.length > 0) {
    const dataToInsert = existingData.map(row => ({
      task_id: row.task_id,
      file_id: row.file_id,
      project_id: row.project_id || 1,
    }));

    await knex('t_task_file_links').insert(dataToInsert);
    console.error(`  ✓ Restored ${dataToInsert.length} rows`);
  }

  console.error('✅ t_task_file_links schema reverted to v3.8.x state');
}
