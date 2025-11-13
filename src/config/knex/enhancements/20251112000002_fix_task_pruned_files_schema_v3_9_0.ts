/**
 * Enhancement: Fix t_task_pruned_files schema for v3.9.0
 *
 * Problem: The v3.9.0 migration creates t_task_pruned_files with project_id,
 * but if the table was already created by v3.5 migration (without project_id),
 * the v3.9.0 migration skips table creation, leaving the schema incomplete.
 *
 * Solution: Add project_id and linked_decision_key_id columns if missing.
 *
 * This enhancement ensures compatibility with databases upgraded from v3.5.x
 * that already have t_task_pruned_files table without these columns.
 *
 * IDEMPOTENT: Can be run multiple times safely.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Checking t_task_pruned_files schema...');

  const hasTable = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasTable) {
    console.log('⚠️  t_task_pruned_files table does not exist, skipping');
    return;
  }

  // Check if project_id column exists
  const hasProjectId = await knex.schema.hasColumn('t_task_pruned_files', 'project_id');
  const hasLinkedDecision = await knex.schema.hasColumn('t_task_pruned_files', 'linked_decision_key_id');

  if (!hasProjectId || !hasLinkedDecision) {
    console.log('🔄 Adding missing columns to t_task_pruned_files...');

    await knex.schema.alterTable('t_task_pruned_files', (table) => {
      if (!hasProjectId) {
        // Add project_id with default value for existing rows
        table.integer('project_id').notNullable().defaultTo(1)
          .references('id').inTable('m_projects').onDelete('CASCADE');
      }
      if (!hasLinkedDecision) {
        // Add linked_decision_key_id column (nullable)
        table.integer('linked_decision_key_id').nullable()
          .references('id').inTable('m_context_keys').onDelete('SET NULL');
      }
    });

    const added = [];
    if (!hasProjectId) added.push('project_id');
    if (!hasLinkedDecision) added.push('linked_decision_key_id');

    console.log(`✓ Added columns: ${added.join(', ')}`);
  } else {
    console.log('✓ All columns already exist, skipping');
  }

  console.log('✅ t_task_pruned_files schema fix completed');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back t_task_pruned_files schema fix...');

  const hasTable = await knex.schema.hasTable('t_task_pruned_files');
  if (!hasTable) {
    console.log('⚠️  t_task_pruned_files table does not exist, skipping');
    return;
  }

  // Check columns individually before dropping
  const hasProjectId = await knex.schema.hasColumn('t_task_pruned_files', 'project_id');
  const hasLinkedDecision = await knex.schema.hasColumn('t_task_pruned_files', 'linked_decision_key_id');

  if (hasProjectId || hasLinkedDecision) {
    await knex.schema.alterTable('t_task_pruned_files', (table) => {
      if (hasLinkedDecision) table.dropColumn('linked_decision_key_id');
      if (hasProjectId) table.dropColumn('project_id');
    });

    const dropped = [];
    if (hasProjectId) dropped.push('project_id');
    if (hasLinkedDecision) dropped.push('linked_decision_key_id');

    console.log(`✓ Dropped columns: ${dropped.join(', ')}`);
  } else {
    console.log('✓ Columns do not exist, skipping');
  }

  console.log('✅ t_task_pruned_files schema fix rollback completed');
}
