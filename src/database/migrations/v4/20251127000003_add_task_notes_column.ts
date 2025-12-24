/**
 * Migration: Add notes column to v4_tasks
 *
 * This column stores rejection_reason when a task is moved to rejected status.
 *
 * @version v4.1
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.error('Adding notes column to v4_tasks...');

  const hasColumn = await knex.schema.hasColumn('v4_tasks', 'notes');
  if (!hasColumn) {
    await knex.schema.alterTable('v4_tasks', (table) => {
      table.text('notes').nullable();
    });
    console.error('  ✓ notes column added to v4_tasks');
  } else {
    console.error('  ℹ notes column already exists, skipping');
  }

  console.error('✅ Migration completed');
}

export async function down(knex: Knex): Promise<void> {
  console.error('Removing notes column from v4_tasks...');

  const hasColumn = await knex.schema.hasColumn('v4_tasks', 'notes');
  if (hasColumn) {
    await knex.schema.alterTable('v4_tasks', (table) => {
      table.dropColumn('notes');
    });
    console.error('  ✓ notes column removed from v4_tasks');
  }

  console.error('✅ Rollback completed');
}
