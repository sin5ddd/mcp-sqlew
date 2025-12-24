/**
 * Converted from: src/config/knex/enhancements/20251027020000_update_agent_reusability.ts
 * Line count: 42 → 42 (0% reduction)
 *
 * No wrapper needed - pure data seeding migration
 *
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
  // Check if is_reusable column exists (depends on previous migration)
  const hasColumn = await knex.schema.hasColumn('m_agents', 'is_reusable');

  if (!hasColumn) {
    console.error('✓ Column is_reusable does not exist, skipping update');
    return;
  }

  // Core system agents that should NOT be reusable
  const systemAgents = ['system', 'migration-manager'];

  // Mark all agents as reusable except system agents
  await knex('m_agents')
    .whereNotIn('name', systemAgents)
    .update({ is_reusable: true });

  console.error('✅ Updated agents to reusable (except system/migration-manager)');
}

export async function down(knex: Knex): Promise<void> {
  // Revert: mark all agents as non-reusable
  await knex('m_agents').update({ is_reusable: false });

  console.error('↩️  Reverted all agents to non-reusable');
}
