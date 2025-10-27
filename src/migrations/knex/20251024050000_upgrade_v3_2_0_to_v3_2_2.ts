/**
 * Knex Migration: v3.2.0 → v3.2.2 (Add Decision Context)
 *
 * Adds rich context for decisions (rationale, alternatives, tradeoffs).
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration
  const hasDecisionContext = await knex.schema.hasTable('t_decision_context');

  if (hasDecisionContext) {
    console.log('✓ t_decision_context already exists, skipping v3.2.2 migration');
    return;
  }

  // Check if we have v3.2.0 schema (task dependencies exist)
  const hasDependencies = await knex.schema.hasTable('t_task_dependencies');
  if (!hasDependencies) {
    console.log('✓ No v3.2.0 schema detected, skipping v3.2.2 migration');
    return;
  }

  console.log('🔄 Migrating v3.2.0 → v3.2.2 (adding decision context)...');

  // Create decision context table
  await knex.schema.createTable('t_decision_context', (table) => {
    table.increments('id').primary();
    table.integer('decision_id').notNullable()
      .references('id').inTable('t_decisions').onDelete('CASCADE');
    table.text('rationale');
    table.text('alternatives');
    table.text('tradeoffs');
    table.integer('task_id').references('id').inTable('t_tasks').onDelete('SET NULL');
    table.integer('constraint_id').references('id').inTable('t_constraints').onDelete('SET NULL');
    table.bigInteger('created_ts').notNullable()
      .defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.index('decision_id', 'idx_decision_context_decision_id');
    table.index('task_id', 'idx_decision_context_task_id');
  });

  console.log('  ✓ Created t_decision_context');

  console.log('✅ v3.2.0 → v3.2.2 migration complete');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('t_decision_context');
}
