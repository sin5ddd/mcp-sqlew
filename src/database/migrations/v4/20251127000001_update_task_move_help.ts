/**
 * Migration: Update task.move help data for v4.0 changes
 *
 * Changes:
 * - Updates move action description to reflect relaxed transitions
 * - Adds rejection_reason parameter to task:move action
 *
 * Note: Help data was originally seeded in v3 migration 20251025100000_seed_help_metadata.ts
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('Updating task.move help data for v4.0 changes...');

  // 1. Get action_id for task:move
  const moveAction = await knex('v4_help_actions')
    .where({ tool_name: 'task', action_name: 'move' })
    .select('id')
    .first() as { id: number } | undefined;

  if (!moveAction) {
    console.log('  ℹ task:move action not found in help system, skipping');
    return;
  }

  const actionId = moveAction.id;

  // 2. Update move action description
  await knex('v4_help_actions')
    .where({ id: actionId })
    .update({
      description: 'Move task to new status with validation. v4.0: Flexible transitions between non-terminal statuses (todo, in_progress, waiting_review, blocked, done). Terminal statuses (archived, rejected) are final. Use rejection_reason when moving to rejected.'
    });
  console.log('  ✓ Updated move action description');

  // 3. Check if rejection_reason param already exists (idempotent)
  const existingParam = await knex('v4_help_action_params')
    .where({ action_id: actionId, param_name: 'rejection_reason' })
    .first();

  if (!existingParam) {
    // 4. Add rejection_reason parameter
    await knex('v4_help_action_params').insert({
      action_id: actionId,
      param_name: 'rejection_reason',
      param_type: 'string',
      required: 0,
      description: 'Optional reason for rejection (stored in task notes). Only applicable when status is "rejected".',
      default_value: null
    });
    console.log('  ✓ Added rejection_reason parameter');
  } else {
    console.log('  ℹ rejection_reason parameter already exists, skipping');
  }

  console.log('✅ Migration completed');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Reverting task.move help data changes...');

  // 1. Get action_id for task:move
  const moveAction = await knex('v4_help_actions')
    .where({ tool_name: 'task', action_name: 'move' })
    .select('id')
    .first() as { id: number } | undefined;

  if (!moveAction) {
    console.log('  ℹ task:move action not found, skipping');
    return;
  }

  const actionId = moveAction.id;

  // 2. Restore original description
  await knex('v4_help_actions')
    .where({ id: actionId })
    .update({
      description: 'Move task to new status with validation. Enforces state machine transitions (e.g., cannot jump todo → done). Automatically logs status changes and updates timestamps.'
    });
  console.log('  ✓ Restored original move action description');

  // 3. Remove rejection_reason parameter
  await knex('v4_help_action_params')
    .where({ action_id: actionId, param_name: 'rejection_reason' })
    .delete();
  console.log('  ✓ Removed rejection_reason parameter');

  console.log('✅ Rollback completed');
}
