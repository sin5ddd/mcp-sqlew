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

  // Check if project_id column exists (required for this constraint)
  const hasProjectId = await knex.schema.hasColumn('t_task_file_links', 'project_id');
  if (!hasProjectId) {
    console.log('✓ t_task_file_links.project_id does not exist yet, skipping (will be created later)');
    return;
  }

  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';
  const isMySQL = client === 'mysql' || client === 'mysql2';

  // Try to create unique index - if it fails because it exists, that's fine
  try {
    if (isSQLite || isMySQL) {
      // SQLite and MySQL: CREATE UNIQUE INDEX
      await knex.raw(`
        CREATE UNIQUE INDEX idx_task_file_links_unique
        ON t_task_file_links (project_id, task_id, file_id)
      `);
    } else {
      // PostgreSQL: Use Knex schema builder
      await knex.schema.alterTable('t_task_file_links', (table) => {
        table.unique(['project_id', 'task_id', 'file_id'], { indexName: 'idx_task_file_links_unique' });
      });
    }
    console.log('✅ Added UNIQUE constraint to t_task_file_links (project_id, task_id, file_id)');
  } catch (error: any) {
    // Check if error is due to index already existing
    if (error.message && (
      error.message.includes('already exists') ||
      error.message.includes('Duplicate key name') ||
      error.message.includes('duplicate key') ||
      error.message.includes('relation') && error.message.includes('already exists')
    )) {
      console.log('✓ UNIQUE constraint already exists on t_task_file_links, skipping');
    } else {
      // Re-throw if it's a different error
      throw error;
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔧 Removing UNIQUE constraint from t_task_file_links...');

  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';
  const isMySQL = client === 'mysql' || client === 'mysql2';

  try {
    if (isSQLite) {
      await knex.raw('DROP INDEX IF EXISTS idx_task_file_links_unique');
    } else if (isMySQL) {
      await knex.raw('DROP INDEX idx_task_file_links_unique ON t_task_file_links');
    } else {
      // PostgreSQL
      await knex.schema.alterTable('t_task_file_links', (table) => {
        table.dropUnique(['project_id', 'task_id', 'file_id'], 'idx_task_file_links_unique');
      });
    }
    console.log('✅ Removed UNIQUE constraint from t_task_file_links');
  } catch (error: any) {
    if (error.message && (
      error.message.includes('does not exist') ||
      error.message.includes("Can't DROP")
    )) {
      console.log('✓ UNIQUE constraint does not exist, nothing to remove');
    } else {
      throw error;
    }
  }
}
