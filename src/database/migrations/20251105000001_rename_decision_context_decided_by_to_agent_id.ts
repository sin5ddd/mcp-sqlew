/**
 * Converted from: src/config/knex/enhancements/20251105000001_rename_decision_context_decided_by_to_agent_id.ts
 * Line count: 129 → 129 (0% reduction)
 *
 * No wrapper needed - Column rename functionality not provided by wrapper
 *
 * Migration: Rename t_decision_context.decided_by_agent_id → agent_id
 *
 * CONTEXT:
 * - Bootstrap migration (20251025021152) creates t_decision_context with `agent_id`
 * - Upgrade migration v3.7.0 (20251104000000) creates table with `decided_by_agent_id`
 * - Tool code (src/database.ts line 507) expects `agent_id`
 *
 * ISSUE:
 * - Fresh installs: Have `agent_id` ✓
 * - Upgraded databases: Have `decided_by_agent_id` ✗
 * - Result: "table t_decision_context has no column named agent_id" error
 *
 * DECISION:
 * Standardize on `agent_id` to match:
 * - Bootstrap migrations
 * - Tool code expectations
 * - Other transaction tables (t_decisions, t_file_changes, t_constraints)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;

  // Check if t_decision_context exists
  const hasTable = await knex.schema.hasTable('t_decision_context');
  if (!hasTable) {
    console.log('  ⏭  t_decision_context does not exist, skipping');
    return;
  }

  // Check if column needs renaming
  const hasDecidedBy = await knex.schema.hasColumn('t_decision_context', 'decided_by_agent_id');
  const hasAgentId = await knex.schema.hasColumn('t_decision_context', 'agent_id');

  if (hasAgentId && !hasDecidedBy) {
    console.log('  ✓ t_decision_context already has agent_id, skipping');
    return;
  }

  if (!hasDecidedBy && !hasAgentId) {
    console.log('  ⚠  t_decision_context missing both decided_by_agent_id and agent_id, adding agent_id');
    await knex.schema.alterTable('t_decision_context', (table) => {
      table.integer('agent_id').unsigned().nullable();
      table.foreign('agent_id').references('m_agents.id');
    });
    console.log('  ✓ Added agent_id column to t_decision_context');
    return;
  }

  if (hasDecidedBy) {
    console.log('  🔄 Renaming t_decision_context.decided_by_agent_id → agent_id');

    if (client === 'better-sqlite3' || client === 'sqlite3') {
      // SQLite supports RENAME COLUMN in recent versions
      await knex.raw('ALTER TABLE t_decision_context RENAME COLUMN decided_by_agent_id TO agent_id');
      console.log('  ✓ Renamed decided_by_agent_id → agent_id (SQLite)');
    } else if (client === 'mysql' || client === 'mysql2') {
      // MySQL requires specifying the full column definition
      await knex.raw(`
        ALTER TABLE t_decision_context
        CHANGE COLUMN decided_by_agent_id agent_id INTEGER UNSIGNED NULL
      `);
      // Re-add foreign key if it exists
      try {
        await knex.raw(`
          ALTER TABLE t_decision_context
          ADD CONSTRAINT t_decision_context_agent_id_foreign
          FOREIGN KEY (agent_id) REFERENCES m_agents(id)
        `);
      } catch (err: any) {
        if (err.message && err.message.includes('Duplicate key')) {
          console.log('  ✓ Foreign key already exists');
        } else {
          throw err;
        }
      }
      console.log('  ✓ Renamed decided_by_agent_id → agent_id (MySQL)');
    } else if (client === 'pg' || client === 'postgresql') {
      // PostgreSQL supports RENAME COLUMN
      await knex.raw('ALTER TABLE t_decision_context RENAME COLUMN decided_by_agent_id TO agent_id');
      console.log('  ✓ Renamed decided_by_agent_id → agent_id (PostgreSQL)');
    }
  }

  console.log('✅ Migration complete: t_decision_context now uses agent_id');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;

  // Check if t_decision_context exists
  const hasTable = await knex.schema.hasTable('t_decision_context');
  if (!hasTable) {
    console.log('  ⏭  t_decision_context does not exist, skipping rollback');
    return;
  }

  // Check if we need to rollback
  const hasAgentId = await knex.schema.hasColumn('t_decision_context', 'agent_id');
  const hasDecidedBy = await knex.schema.hasColumn('t_decision_context', 'decided_by_agent_id');

  if (hasDecidedBy && !hasAgentId) {
    console.log('  ✓ t_decision_context already has decided_by_agent_id, rollback not needed');
    return;
  }

  if (hasAgentId) {
    console.log('  🔄 Rolling back: Renaming t_decision_context.agent_id → decided_by_agent_id');

    if (client === 'better-sqlite3' || client === 'sqlite3') {
      await knex.raw('ALTER TABLE t_decision_context RENAME COLUMN agent_id TO decided_by_agent_id');
      console.log('  ✓ Rolled back to decided_by_agent_id (SQLite)');
    } else if (client === 'mysql' || client === 'mysql2') {
      await knex.raw(`
        ALTER TABLE t_decision_context
        CHANGE COLUMN agent_id decided_by_agent_id INTEGER UNSIGNED NULL
      `);
      console.log('  ✓ Rolled back to decided_by_agent_id (MySQL)');
    } else if (client === 'pg' || client === 'postgresql') {
      await knex.raw('ALTER TABLE t_decision_context RENAME COLUMN agent_id TO decided_by_agent_id');
      console.log('  ✓ Rolled back to decided_by_agent_id (PostgreSQL)');
    }
  }

  console.log('✅ Rollback complete: t_decision_context reverted to decided_by_agent_id');
}
