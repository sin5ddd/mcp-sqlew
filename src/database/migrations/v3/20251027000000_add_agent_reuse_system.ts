/**
 * Converted from: src/config/knex/enhancements/20251027000000_add_agent_reuse_system.ts
 * Line count: 66 → 52 (21% reduction)
 *
 * Migration: Add agent reuse system
 *
 * Adds columns to m_agents to support reusing generic agent slots while
 * preserving user-specified agent names.
 *
 * - is_reusable: Whether this agent slot can be reused (generic agents)
 * - in_use: Whether the agent is currently active
 * - last_active_ts: Last activity timestamp for cleanup
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Add columns for agent reuse system
  await db.addColumnSafe('m_agents', 'is_reusable', (table) => {
    return table.boolean('is_reusable').defaultTo(false);
  });

  await db.addColumnSafe('m_agents', 'in_use', (table) => {
    return table.boolean('in_use').defaultTo(false);
  });

  await db.addColumnSafe('m_agents', 'last_active_ts', (table) => {
    return table.integer('last_active_ts').defaultTo(0);
  });

  // Create index for finding inactive reusable agents
  await db.createIndexSafe('m_agents', ['is_reusable', 'in_use', 'last_active_ts'], 'idx_agents_reusable');

  console.error('✓ Added agent reuse columns and index to m_agents');
}

export async function down(knex: Knex): Promise<void> {
  // Drop index
  await knex.raw('DROP INDEX IF EXISTS idx_agents_reusable');

  // Remove columns
  await knex.schema.alterTable('m_agents', (table) => {
    table.dropColumn('is_reusable');
    table.dropColumn('in_use');
    table.dropColumn('last_active_ts');
  });

  console.error('✓ Removed agent reuse system');
}
