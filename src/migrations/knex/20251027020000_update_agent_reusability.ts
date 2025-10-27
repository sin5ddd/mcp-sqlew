/**
 * Migration: Update agent reusability flags
 *
 * Marks all agents as reusable except core system agents.
 * This enables agent ID reuse to prevent unnecessary proliferation.
 *
 * Agent Classification:
 * - System agents: 'system', 'migration-manager' (not reusable)
 * - Built-in agents: Claude Code defaults like 'Explore' (reusable)
 * - User-defined agents: Custom agents like 'rust-architecture-expert' (reusable)
 * - Generic pool: 'generic-N' pattern (reusable)
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Core system agents that should NOT be reusable
  const systemAgents = ['system', 'migration-manager'];

  // Mark all agents as reusable except system agents
  await knex('m_agents')
    .whereNotIn('name', systemAgents)
    .update({ is_reusable: true });

  console.log('✅ Updated agents to reusable (except system/migration-manager)');
}

export async function down(knex: Knex): Promise<void> {
  // Revert: mark all agents as non-reusable
  await knex('m_agents').update({ is_reusable: false });

  console.log('↩️  Reverted all agents to non-reusable');
}
