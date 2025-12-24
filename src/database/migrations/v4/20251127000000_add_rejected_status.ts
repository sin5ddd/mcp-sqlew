/**
 * Migration: Add rejected status to v4_task_statuses
 *
 * Changes:
 * - Adds 'rejected' status (id=7) to v4_task_statuses master table
 *
 * Purpose:
 * - Provides a terminal status for tasks that are cancelled due to spec changes
 * - Like 'archived', tasks in 'rejected' cannot transition to other statuses
 * - Optional rejection_reason stored in task notes via move action
 *
 * Note: No data migration needed - existing tasks remain unchanged
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.error('Adding rejected status to v4_task_statuses...');

  // Check if rejected status already exists (idempotent)
  const existingStatus = await knex('v4_task_statuses')
    .where({ id: 7 })
    .orWhere({ name: 'rejected' })
    .first();

  if (!existingStatus) {
    await knex('v4_task_statuses').insert({
      id: 7,
      name: 'rejected'
    });
    console.error('  ✓ Added rejected status (id=7)');
  } else {
    console.error('  ℹ rejected status already exists, skipping');
  }

  console.error('✅ Migration completed');
}

export async function down(knex: Knex): Promise<void> {
  console.error('Removing rejected status from v4_task_statuses...');

  // Check for tasks using rejected status before removing
  const tasksWithRejected = await knex('v4_tasks')
    .where({ status_id: 7 })
    .count('* as count')
    .first();

  if (tasksWithRejected && Number(tasksWithRejected.count) > 0) {
    throw new Error(
      `Cannot rollback: ${tasksWithRejected.count} tasks are using rejected status. ` +
      `Please move them to another status first.`
    );
  }

  await knex('v4_task_statuses')
    .where({ id: 7 })
    .delete();

  console.error('  ✓ Removed rejected status');
  console.error('✅ Rollback completed');
}
