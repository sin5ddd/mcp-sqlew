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

  // Drop existing view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');

  // Recreate with project_id included
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           datetime(c.ts, 'unixepoch') as created
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

  // Drop the fixed view
  await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');

  // Recreate the buggy version (for rollback compatibility)
  // NOTE: This is the broken version from the original migration
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           cat.name as category,
           c.priority,
           a.name as author,
           datetime(c.ts, 'unixepoch') as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  console.log('⏪ Rolled back to original (broken) v_tagged_constraints');
}
