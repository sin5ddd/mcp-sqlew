import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // Check if link_type column already exists
  const hasColumn = await knex.schema.hasColumn('t_task_decision_links', 'link_type');

  if (!hasColumn) {
    // Add link_type column to t_task_decision_links table
    await knex.schema.alterTable('t_task_decision_links', (table) => {
      table.text('link_type').defaultTo('implements');
    });
    console.log('✅ Added link_type column to t_task_decision_links');
  } else {
    console.log('✓ link_type column already exists, skipping');
  }
}


export async function down(knex: Knex): Promise<void> {
  // Remove link_type column from t_task_decision_links table
  await knex.schema.alterTable('t_task_decision_links', (table) => {
    table.dropColumn('link_type');
  });

  console.log('✅ Removed link_type column from t_task_decision_links');
}

