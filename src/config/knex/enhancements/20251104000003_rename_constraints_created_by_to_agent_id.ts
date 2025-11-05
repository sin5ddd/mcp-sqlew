/**
 * Migration: Rename t_constraints.created_by → agent_id
 *
 * CONTEXT:
 * Oct 27 commit 5006e4b "Agent Type Normalization" changed tool code from
 * `created_by` to `agent_id` but missed creating this migration.
 *
 * AFFECTED:
 * - Databases created before Nov 4 (from old schema.sql with `created_by`)
 * - Fresh installs after Nov 4 already have `agent_id` from bootstrap
 *
 * DECISION:
 * Standardize on `agent_id` across all transaction tables for consistency:
 * - t_decisions: uses `agent_id` ✓
 * - t_file_changes: uses `agent_id` ✓
 * - t_constraints: had `created_by` → rename to `agent_id`
 * - t_tasks: uses `assigned_agent_id` ✓
 *
 * Tool code (src/tools/constraints.ts line 105) expects `agent_id`.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;

  // Check if t_constraints exists
  const hasTable = await knex.schema.hasTable('t_constraints');
  if (!hasTable) {
    console.log('  ⏭  t_constraints does not exist, skipping');
    return;
  }

  // Check if column needs renaming
  const hasCreatedBy = await knex.schema.hasColumn('t_constraints', 'created_by');
  const hasAgentId = await knex.schema.hasColumn('t_constraints', 'agent_id');

  if (hasAgentId && !hasCreatedBy) {
    console.log('  ✓ t_constraints already has agent_id, skipping');
    return;
  }

  if (!hasCreatedBy && !hasAgentId) {
    console.log('  ⚠  t_constraints missing both created_by and agent_id, adding agent_id');
    await knex.schema.alterTable('t_constraints', (table) => {
      table.integer('agent_id').unsigned().nullable();
      table.foreign('agent_id').references('m_agents.id');
    });
    console.log('  ✓ Added agent_id column to t_constraints');
    return;
  }

  if (hasCreatedBy) {
    console.log('  🔄 Renaming t_constraints.created_by → agent_id');

    // CRITICAL: Drop views that depend on t_constraints before renaming column
    // Old schemas have views that reference c.created_by, which will break after rename
    console.log('  🔄 Dropping dependent views before column rename...');
    await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');
    console.log('  ✓ Dropped v_tagged_constraints (will recreate after rename)');

    if (client === 'better-sqlite3' || client === 'sqlite3') {
      // SQLite doesn't support RENAME COLUMN directly, use ALTER TABLE
      await knex.raw('ALTER TABLE t_constraints RENAME COLUMN created_by TO agent_id');
      console.log('  ✓ Renamed created_by → agent_id (SQLite)');
    } else if (client === 'mysql' || client === 'mysql2') {
      // MySQL requires specifying the full column definition
      await knex.raw(`
        ALTER TABLE t_constraints
        CHANGE COLUMN created_by agent_id INTEGER UNSIGNED NULL
      `);
      // Re-add foreign key if it exists
      try {
        await knex.raw(`
          ALTER TABLE t_constraints
          ADD CONSTRAINT t_constraints_agent_id_foreign
          FOREIGN KEY (agent_id) REFERENCES m_agents(id)
        `);
      } catch (err: any) {
        if (err.message && err.message.includes('Duplicate key')) {
          console.log('  ✓ Foreign key already exists');
        } else {
          throw err;
        }
      }
      console.log('  ✓ Renamed created_by → agent_id (MySQL)');
    } else if (client === 'pg' || client === 'postgresql') {
      // PostgreSQL supports RENAME COLUMN
      await knex.raw('ALTER TABLE t_constraints RENAME COLUMN created_by TO agent_id');
      console.log('  ✓ Renamed created_by → agent_id (PostgreSQL)');
    }

    // Recreate the view with updated column name
    console.log('  🔄 Recreating v_tagged_constraints view...');
    const createViewStatement = client === 'mysql' || client === 'mysql2' || client === 'pg'
      ? 'CREATE OR REPLACE VIEW'
      : 'CREATE VIEW IF NOT EXISTS';

    const dateFunction = client === 'mysql' || client === 'mysql2'
      ? 'FROM_UNIXTIME(c.ts)'
      : client === 'pg'
      ? "to_timestamp(c.ts) AT TIME ZONE 'UTC'"
      : "datetime(c.ts, 'unixepoch')";

    await knex.raw(`
      ${createViewStatement} v_tagged_constraints AS
      SELECT
          c.id,
          cc.name as category,
          l.name as layer,
          c.constraint_text,
          CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
          (SELECT GROUP_CONCAT(t2.name, ',') FROM t_constraint_tags ct2
           JOIN m_tags t2 ON ct2.tag_id = t2.id
           WHERE ct2.constraint_id = c.id) as tags,
          a.name as created_by,
          ${dateFunction} as created_at
      FROM t_constraints c
      JOIN m_constraint_categories cc ON c.category_id = cc.id
      LEFT JOIN m_layers l ON c.layer_id = l.id
      LEFT JOIN m_agents a ON c.agent_id = a.id
      WHERE c.active = 1
      ORDER BY c.priority DESC, cc.name, c.ts DESC
    `);
    console.log('  ✓ Recreated v_tagged_constraints with agent_id reference');
  }

  console.log('✅ Migration complete: t_constraints now uses agent_id');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;

  // Check if t_constraints exists
  const hasTable = await knex.schema.hasTable('t_constraints');
  if (!hasTable) {
    console.log('  ⏭  t_constraints does not exist, skipping rollback');
    return;
  }

  // Check if we need to rollback
  const hasAgentId = await knex.schema.hasColumn('t_constraints', 'agent_id');
  const hasCreatedBy = await knex.schema.hasColumn('t_constraints', 'created_by');

  if (hasCreatedBy && !hasAgentId) {
    console.log('  ✓ t_constraints already has created_by, rollback not needed');
    return;
  }

  if (hasAgentId) {
    console.log('  🔄 Rolling back: Renaming t_constraints.agent_id → created_by');

    // Drop view before column rename
    console.log('  🔄 Dropping v_tagged_constraints before rollback...');
    await knex.raw('DROP VIEW IF EXISTS v_tagged_constraints');

    if (client === 'better-sqlite3' || client === 'sqlite3') {
      await knex.raw('ALTER TABLE t_constraints RENAME COLUMN agent_id TO created_by');
      console.log('  ✓ Rolled back to created_by (SQLite)');
    } else if (client === 'mysql' || client === 'mysql2') {
      await knex.raw(`
        ALTER TABLE t_constraints
        CHANGE COLUMN agent_id created_by INTEGER UNSIGNED NULL
      `);
      console.log('  ✓ Rolled back to created_by (MySQL)');
    } else if (client === 'pg' || client === 'postgresql') {
      await knex.raw('ALTER TABLE t_constraints RENAME COLUMN agent_id TO created_by');
      console.log('  ✓ Rolled back to created_by (PostgreSQL)');
    }

    // Recreate view with old column name (created_by)
    console.log('  🔄 Recreating v_tagged_constraints with created_by reference...');
    const createViewStatement = client === 'mysql' || client === 'mysql2' || client === 'pg'
      ? 'CREATE OR REPLACE VIEW'
      : 'CREATE VIEW IF NOT EXISTS';

    const dateFunction = client === 'mysql' || client === 'mysql2'
      ? 'FROM_UNIXTIME(c.ts)'
      : client === 'pg'
      ? "to_timestamp(c.ts) AT TIME ZONE 'UTC'"
      : "datetime(c.ts, 'unixepoch')";

    await knex.raw(`
      ${createViewStatement} v_tagged_constraints AS
      SELECT
          c.id,
          cc.name as category,
          l.name as layer,
          c.constraint_text,
          CASE c.priority WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END as priority,
          (SELECT GROUP_CONCAT(t2.name, ',') FROM t_constraint_tags ct2
           JOIN m_tags t2 ON ct2.tag_id = t2.id
           WHERE ct2.constraint_id = c.id) as tags,
          a.name as created_by,
          ${dateFunction} as created_at
      FROM t_constraints c
      JOIN m_constraint_categories cc ON c.category_id = cc.id
      LEFT JOIN m_layers l ON c.layer_id = l.id
      LEFT JOIN m_agents a ON c.created_by = a.id
      WHERE c.active = 1
      ORDER BY c.priority DESC, cc.name, c.ts DESC
    `);
    console.log('  ✓ Recreated v_tagged_constraints with created_by reference');
  }

  console.log('✅ Rollback complete: t_constraints reverted to created_by');
}
