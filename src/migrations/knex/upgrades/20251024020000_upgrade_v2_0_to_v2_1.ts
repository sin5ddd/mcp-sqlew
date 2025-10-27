/**
 * Knex Migration: v2.0.0 → v2.1.0 (Add Activity Log & Features)
 *
 * Adds:
 * - t_activity_log table
 * - Additional columns for version and timestamps
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if we need this migration (activity log doesn't exist yet)
  const hasActivityLog = await knex.schema.hasTable('t_activity_log');

  if (hasActivityLog) {
    console.log('✓ t_activity_log already exists, skipping v2.1.0 migration');
    return;
  }

  // Check if we have prefixed tables (v1.1.0+/v2.0.0)
  const hasPrefixedTables = await knex.schema.hasTable('m_agents');
  if (!hasPrefixedTables) {
    console.log('✓ No v2.0.0 schema detected, skipping v2.1.0 migration');
    return;
  }

  console.log('🔄 Migrating v2.0.0 → v2.1.0 (adding activity log)...');

  // Create activity log table
  await knex.schema.createTable('t_activity_log', (table) => {
    table.increments('id').primary();
    table.bigInteger('ts').notNullable().defaultTo(knex.raw("(strftime('%s', 'now'))"));
    table.string('action_type', 50).notNullable();
    table.text('details');
    table.index('ts', 'idx_activity_log_ts');
  });

  console.log('  ✓ Created t_activity_log table');

  console.log('✅ v2.0.0 → v2.1.0 migration complete');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('t_activity_log');
}
