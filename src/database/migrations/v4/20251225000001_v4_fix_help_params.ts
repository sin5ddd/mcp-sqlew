/**
 * v4 Fix Help Params Migration
 *
 * Fixes incorrect parameter descriptions in the help system:
 * - constraint:add priority: "Priority: 1-4" → "Priority level: low, medium, high, critical"
 *
 * NOTE: file:record agent_name is not in DB (handled in code only)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.error('🔧 Fixing help parameter descriptions...');

  // Get constraint:add action ID
  const constraintAddAction = await knex('v4_help_actions')
    .where({ tool_name: 'constraint', action_name: 'add' })
    .select('id')
    .first();

  if (constraintAddAction) {
    // Fix priority description: "Priority: 1-4" → "Priority level: low, medium, high, critical"
    const updated = await knex('v4_help_action_params')
      .where({
        action_id: constraintAddAction.id,
        param_name: 'priority'
      })
      .update({
        param_type: 'string',
        description: 'Priority level: low, medium, high, critical',
        default_value: 'medium'
      });

    if (updated > 0) {
      console.error('  ✓ Fixed constraint:add priority parameter');
    } else {
      console.error('  ℹ constraint:add priority parameter not found (may not exist)');
    }
  } else {
    console.error('  ⚠ constraint:add action not found');
  }

  console.error('🎉 Help parameter descriptions fixed!');
}

export async function down(knex: Knex): Promise<void> {
  // Get constraint:add action ID
  const constraintAddAction = await knex('v4_help_actions')
    .where({ tool_name: 'constraint', action_name: 'add' })
    .select('id')
    .first();

  if (constraintAddAction) {
    // Revert to original values
    await knex('v4_help_action_params')
      .where({
        action_id: constraintAddAction.id,
        param_name: 'priority'
      })
      .update({
        param_type: 'number',
        description: 'Priority: 1-4',
        default_value: '2'
      });
  }

  console.error('🗑️ Help parameter descriptions reverted');
}
