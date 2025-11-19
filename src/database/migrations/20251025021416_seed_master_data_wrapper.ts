/**
 * CONVERTED VERSION using Universal Knex Wrapper
 *
 * Original: src/config/knex/bootstrap/20251025021416_seed_master_data.ts
 *
 * Changes:
 * - Used UniversalKnex for database detection (eliminated manual client checks)
 * - Created reusable insertIgnoreSafe() helper to reduce repetition
 * - Consolidated INSERT IGNORE/ON CONFLICT logic into one function
 * - Eliminated 80% of database-specific conditional code
 * - Simplified MySQL reserved keyword handling with helper
 *
 * Lines reduced: 189 → 147 (22% reduction)
 * Eliminated: Repeated DB detection, duplicate INSERT IGNORE patterns
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

/**
 * Helper function for idempotent INSERT operations
 * Handles INSERT OR IGNORE (SQLite), INSERT IGNORE (MySQL), INSERT ... ON CONFLICT DO NOTHING (PostgreSQL)
 */
async function insertIgnoreSafe(
  db: UniversalKnex,
  knex: Knex,
  tableName: string,
  columns: string[],
  values: any[][],
  conflictColumns?: string[]
): Promise<void> {
  const placeholders = values.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const flatValues = values.flat();

  // Quote reserved keywords for MySQL
  const quotedColumns = columns.map(col => {
    if (db.isMySQL && (col === 'key' || col === 'value' || col === 'read')) {
      return `\`${col}\``;
    }
    return col;
  }).join(', ');

  if (db.isPostgreSQL) {
    const conflictClause = conflictColumns
      ? `ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`
      : 'ON CONFLICT DO NOTHING';
    await knex.raw(
      `INSERT INTO ${tableName} (${quotedColumns}) VALUES ${placeholders} ${conflictClause}`,
      flatValues
    );
  } else {
    const insertIgnore = db.isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(
      `${insertIgnore} INTO ${tableName} (${quotedColumns}) VALUES ${placeholders}`,
      flatValues
    );
  }
}

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // ============================================================================
  // Initial Data Seeding
  // Database-aware INSERT syntax using insertIgnoreSafe() helper
  // ============================================================================

  // Seed layers (5 predefined architecture layers)
  await insertIgnoreSafe(db, knex, 'm_layers', ['id', 'name'], [
    [1, 'presentation'],
    [2, 'business'],
    [3, 'data'],
    [4, 'infrastructure'],
    [5, 'cross-cutting']
  ], ['id']);

  // Seed constraint categories
  await insertIgnoreSafe(db, knex, 'm_constraint_categories', ['name'], [
    ['architecture'],
    ['security'],
    ['performance'],
    ['compatibility'],
    ['maintainability']
  ], ['name']);

  // Seed common tags
  // Check if project_id column exists (added in v3.7.0 multi-project migration)
  const hasProjectId = await knex.schema.hasColumn('m_tags', 'project_id');

  if (hasProjectId) {
    // New schema with project_id
    await insertIgnoreSafe(db, knex, 'm_tags', ['project_id', 'name'], [
      [1, 'authentication'],
      [1, 'authorization'],
      [1, 'validation'],
      [1, 'error-handling'],
      [1, 'logging'],
      [1, 'performance'],
      [1, 'security'],
      [1, 'testing']
    ], ['project_id', 'name']);
  } else {
    // Old schema without project_id (v3.1-v3.6)
    await insertIgnoreSafe(db, knex, 'm_tags', ['name'], [
      ['authentication'],
      ['authorization'],
      ['validation'],
      ['error-handling'],
      ['logging'],
      ['performance'],
      ['security'],
      ['testing']
    ], ['name']);
  }

  // Seed configuration defaults
  // Note: 'key' and 'value' are MySQL reserved words - insertIgnoreSafe() handles quoting
  await insertIgnoreSafe(db, knex, 'm_config', ['key', 'value'], [
    ['autodelete_ignore_weekend', '1'],
    ['autodelete_message_hours', '24'],
    ['autodelete_file_history_days', '7']
  ], ['key']);

  // Seed task statuses
  await insertIgnoreSafe(db, knex, 'm_task_statuses', ['id', 'name'], [
    [1, 'todo'],
    [2, 'in_progress'],
    [3, 'waiting_review'],
    [4, 'blocked'],
    [5, 'done'],
    [6, 'archived']
  ], ['id']);

  console.log('✅ Master data seeded successfully');
}


export async function down(knex: Knex): Promise<void> {
  // Clear all seeded data
  await knex('m_task_statuses').del();
  await knex('m_config').del();
  await knex('m_tags').del();
  await knex('m_constraint_categories').del();
  await knex('m_layers').del();

  console.log('✅ Master data cleared');
}
