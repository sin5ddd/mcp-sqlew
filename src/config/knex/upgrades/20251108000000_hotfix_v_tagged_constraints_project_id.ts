/**
 * Migration: Hotfix v_tagged_constraints view to include project_id
 * Date: 2025-11-08
 * Version: v3.7.4
 *
 * ISSUE: v_tagged_constraints view was missing project_id column in down() migration,
 * causing "no such column: project_id" errors when querying constraints.
 *
 * FIX: Recreate view with project_id column
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔧 Hotfix: Recreating v_tagged_constraints with project_id...');

  // Check if t_constraints has project_id (required for this view)
  const hasProjectId = await knex.schema.hasColumn('t_constraints', 'project_id');
  if (!hasProjectId) {
    console.log('✓ t_constraints.project_id does not exist yet, skipping (will be created later)');
    return;
  }

  // Detect database type for timestamp conversion
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';
  const isMySQL = client === 'mysql' || client === 'mysql2';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  let timestampConversion: string;
  if (isSQLite) {
    timestampConversion = "datetime(c.ts, 'unixepoch')";
  } else if (isMySQL) {
    timestampConversion = 'FROM_UNIXTIME(c.ts)';
  } else if (isPostgreSQL) {
    timestampConversion = 'TO_TIMESTAMP(c.ts)';
  } else {
    // Fallback: return raw timestamp
    timestampConversion = 'c.ts';
  }

  // Drop existing view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');

  // Recreate with project_id included and database-specific timestamp conversion
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           ${timestampConversion} as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  console.log('✅ v_tagged_constraints view recreated with project_id');
}

export async function down(knex: Knex): Promise<void> {
  console.log('⏪ Rolling back v_tagged_constraints hotfix...');

  // Detect database type for timestamp conversion
  const client = knex.client.config.client;
  const isSQLite = client === 'better-sqlite3' || client === 'sqlite3';
  const isMySQL = client === 'mysql' || client === 'mysql2';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  let timestampConversion: string;
  if (isSQLite) {
    timestampConversion = "datetime(c.ts, 'unixepoch')";
  } else if (isMySQL) {
    timestampConversion = 'FROM_UNIXTIME(c.ts)';
  } else if (isPostgreSQL) {
    timestampConversion = 'TO_TIMESTAMP(c.ts)';
  } else {
    timestampConversion = 'c.ts';
  }

  // Drop the fixed view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');

  // Recreate the version without project_id (for rollback compatibility)
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           cat.name as category,
           c.priority,
           a.name as author,
           ${timestampConversion} as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  console.log('⏪ Rolled back to original v_tagged_constraints (without project_id)');
}
