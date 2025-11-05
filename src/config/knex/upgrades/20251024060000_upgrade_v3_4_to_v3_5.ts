/**
 * Knex Migration: v3.4.x → v3.5.0 (Add Pruned Files Tracking)
 *
 * Adds tracking for pruned files in tasks.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration
  const hasPrunedFiles = await knex.schema.hasTable('t_task_pruned_files');

  if (hasPrunedFiles) {
    console.log('✓ t_task_pruned_files already exists, skipping v3.5.0 migration');
    return;
  }

  // Check if we have decision context (v3.2.2+)
  const hasDecisionContext = await knex.schema.hasTable('t_decision_context');
  if (!hasDecisionContext) {
    console.log('✓ No v3.4.x schema detected, skipping v3.5.0 migration');
    return;
  }

  console.log('🔄 Migrating v3.4.x → v3.5.0 (adding pruned files tracking)...');

  // Create pruned files table
  await knex.schema.createTable('t_task_pruned_files', (table) => {
    table.increments('id').primary();
    table.integer('task_id').notNullable()
      .references('id').inTable('t_tasks').onDelete('CASCADE');
    table.string('file_path', 500).notNullable();
    table.bigInteger('pruned_ts').notNullable()
      .defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.index('task_id', 'idx_task_pruned_files_task_id');
  });

  console.log('  ✓ Created t_task_pruned_files');

  console.log('✅ v3.4.x → v3.5.0 migration complete');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('t_task_pruned_files');
}
