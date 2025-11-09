/**
 * Migration: Fix t_task_file_links UNIQUE constraint (v3.8.0)
 *
 * Problem: t_task_file_links missing UNIQUE constraint on (project_id, task_id, file_id)
 * Code expects: ON CONFLICT (project_id, task_id, file_id) DO NOTHING
 * Current state: Only has auto-increment PRIMARY KEY on id
 *
 * Root Cause: v3.7.0 migration added project_id column but didn't update PRIMARY KEY
 * or add UNIQUE constraint. This causes "ON CONFLICT clause does not match any
 * PRIMARY KEY or UNIQUE constraint" error when linking files to tasks.
 *
 * Solution: Add UNIQUE constraint on (project_id, task_id, file_id)
 *
 * Idempotency: Checks if constraint/index already exists before creating
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Adding UNIQUE constraint to t_task_file_links...');

  // Check if unique index already exists
  const indexes = await knex.raw(`
    SELECT name FROM sqlite_master
    WHERE type='index'
    AND tbl_name='t_task_file_links'
    AND name='idx_task_file_links_unique'
  `);

  if (indexes.length > 0) {
    console.log('✓ UNIQUE constraint already exists on t_task_file_links, skipping');
    return;
  }

  // Add UNIQUE constraint via index (SQLite best practice)
  await knex.raw(`
    CREATE UNIQUE INDEX idx_task_file_links_unique
    ON t_task_file_links (project_id, task_id, file_id)
  `);

  console.log('✅ Added UNIQUE constraint to t_task_file_links (project_id, task_id, file_id)');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔧 Removing UNIQUE constraint from t_task_file_links...');

  // Check if index exists before dropping
  const indexes = await knex.raw(`
    SELECT name FROM sqlite_master
    WHERE type='index'
    AND tbl_name='t_task_file_links'
    AND name='idx_task_file_links_unique'
  `);

  if (indexes.length === 0) {
    console.log('✓ UNIQUE constraint does not exist, nothing to remove');
    return;
  }

  await knex.raw('DROP INDEX IF EXISTS idx_task_file_links_unique');

  console.log('✅ Removed UNIQUE constraint from t_task_file_links');
}
