/**
 * Knex Migration: v2.1.x → v3.0.0 (Add Task System)
 *
 * Adds complete task management system:
 * - m_task_statuses (master)
 * - t_tasks
 * - t_task_tags
 * - t_task_scopes
 * - t_task_decision_links
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration
  const hasTaskTables = await knex.schema.hasTable('m_task_statuses');

  if (hasTaskTables) {
    console.log('✓ Task tables already exist, skipping v3.0.0 migration');
    return;
  }

  // Check if we have v2.1.x schema (activity log exists)
  const hasActivityLog = await knex.schema.hasTable('t_activity_log');
  if (!hasActivityLog) {
    console.log('✓ No v2.1.x schema detected, skipping v3.0.0 migration');
    return;
  }

  console.log('🔄 Migrating v2.1.x → v3.0.0 (adding task system)...');

  // Create task statuses master table
  await knex.schema.createTable('m_task_statuses', (table) => {
    table.integer('id').primary();
    table.string('name', 50).notNullable().unique();
  });

  // Seed task statuses
  await knex('m_task_statuses').insert([
    { id: 1, name: 'pending' },
    { id: 2, name: 'in_progress' },
    { id: 3, name: 'completed' },
    { id: 4, name: 'archived' },
  ]);

  console.log('  ✓ Created m_task_statuses');

  // Create tasks table
  await knex.schema.createTable('t_tasks', (table) => {
    table.increments('id').primary();
    table.string('title', 200).notNullable();
    table.text('description');
    table.integer('status_id').notNullable().references('id').inTable('m_task_statuses');
    table.integer('priority').notNullable().defaultTo(3);
    table.string('assigned_agent', 100);
    table.integer('created_by_agent_id').notNullable().references('id').inTable('m_agents');
    table.bigInteger('created_ts').notNullable().defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.bigInteger('updated_ts').notNullable().defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.bigInteger('completed_ts');
    table.index(['status_id', 'priority'], 'idx_tasks_status_priority');
    table.index('created_ts', 'idx_tasks_created_ts');
  });

  console.log('  ✓ Created t_tasks');

  // Create task tags linking table
  await knex.schema.createTable('t_task_tags', (table) => {
    table.integer('task_id').notNullable().references('id').inTable('t_tasks').onDelete('CASCADE');
    table.integer('tag_id').notNullable().references('id').inTable('m_tags').onDelete('CASCADE');
    table.primary(['task_id', 'tag_id']);
  });

  console.log('  ✓ Created t_task_tags');

  // Create task scopes linking table
  await knex.schema.createTable('t_task_scopes', (table) => {
    table.integer('task_id').notNullable().references('id').inTable('t_tasks').onDelete('CASCADE');
    table.integer('scope_id').notNullable().references('id').inTable('m_scopes').onDelete('CASCADE');
    table.primary(['task_id', 'scope_id']);
  });

  console.log('  ✓ Created t_task_scopes');

  // Create task-decision links
  await knex.schema.createTable('t_task_decision_links', (table) => {
    table.integer('task_id').notNullable().references('id').inTable('t_tasks').onDelete('CASCADE');
    table.integer('decision_id').notNullable().references('id').inTable('t_decisions').onDelete('CASCADE');
    table.primary(['task_id', 'decision_id']);
  });

  console.log('  ✓ Created t_task_decision_links');

  console.log('✅ v2.1.x → v3.0.0 migration complete');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('t_task_decision_links');
  await knex.schema.dropTableIfExists('t_task_scopes');
  await knex.schema.dropTableIfExists('t_task_tags');
  await knex.schema.dropTableIfExists('t_tasks');
  await knex.schema.dropTableIfExists('m_task_statuses');
}
