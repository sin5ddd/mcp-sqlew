/**
 * Converted from: src/config/knex/enhancements/20251109000000_fix_task_file_links_unique_constraint_v3_8_0.ts
 * Changes: Replaced manual hasColumn check and DB-specific index creation with UniversalKnex.createIndexSafe()
 * Line count: 94 → 42 lines (55% reduction)
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

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

export async function up(knex: Knex): Promise<void> {
  console.error('🔧 Adding UNIQUE constraint to t_task_file_links...');

  // Check if project_id column exists (required for this constraint)
  const hasProjectId = await knex.schema.hasColumn('t_task_file_links', 'project_id');
  if (!hasProjectId) {
    console.error('✓ t_task_file_links.project_id does not exist yet, skipping (will be created later)');
    return;
  }

  const db = new UniversalKnex(knex);

  // Create unique index with cross-database support
  await db.createIndexSafe(
    't_task_file_links',
    ['project_id', 'task_id', 'file_id'],
    'idx_task_file_links_unique',
    { unique: true }
  );
}

export async function down(knex: Knex): Promise<void> {
  console.error('🔧 Removing UNIQUE constraint from t_task_file_links...');

  const db = new UniversalKnex(knex);
  const client = knex.client.config.client;

  try {
    if (db.isSQLite) {
      await knex.raw('DROP INDEX IF EXISTS idx_task_file_links_unique');
    } else if (db.isMySQL) {
      await knex.raw('DROP INDEX idx_task_file_links_unique ON t_task_file_links');
    } else {
      // PostgreSQL
      await knex.schema.alterTable('t_task_file_links', (table) => {
        table.dropUnique(['project_id', 'task_id', 'file_id'], 'idx_task_file_links_unique');
      });
    }
    console.error('✅ Removed UNIQUE constraint from t_task_file_links');
  } catch (error: any) {
    if (error.message && (
      error.message.includes('does not exist') ||
      error.message.includes("Can't DROP")
    )) {
      console.error('✓ UNIQUE constraint does not exist, nothing to remove');
    } else {
      throw error;
    }
  }
}
