/**
 * Knex Migration: v3.0.x → v3.2.0 (Add Task Dependencies)
 *
 * Adds task dependency tracking with circular dependency detection.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration
  const hasDependencies = await knex.schema.hasTable('t_task_dependencies');

  if (hasDependencies) {
    console.log('✓ t_task_dependencies already exists, skipping v3.2.0 migration');
    return;
  }

  // Check if we have v3.0.x schema (task tables exist)
  const hasTaskTables = await knex.schema.hasTable('t_tasks');
  if (!hasTaskTables) {
    console.log('✓ No v3.0.x schema detected, skipping v3.2.0 migration');
    return;
  }

  console.log('🔄 Migrating v3.0.x → v3.2.0 (adding task dependencies)...');

  // Create task dependencies table
  await knex.schema.createTable('t_task_dependencies', (table) => {
    table.integer('blocker_task_id').notNullable()
      .references('id').inTable('t_tasks').onDelete('CASCADE');
    table.integer('blocked_task_id').notNullable()
      .references('id').inTable('t_tasks').onDelete('CASCADE');
    table.bigInteger('created_ts').notNullable()
      .defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.primary(['blocker_task_id', 'blocked_task_id']);
    table.index('blocked_task_id', 'idx_task_deps_blocked');
  });

  console.log('  ✓ Created t_task_dependencies');

  console.log('✅ v3.0.x → v3.2.0 migration complete');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('t_task_dependencies');
}
