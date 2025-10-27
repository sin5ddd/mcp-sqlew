import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // Add link_type column to t_task_decision_links table
  await knex.schema.alterTable('t_task_decision_links', (table) => {
    table.text('link_type').defaultTo('implements');
  });

  console.log('✅ Added link_type column to t_task_decision_links');
}


export async function down(knex: Knex): Promise<void> {
  // Remove link_type column from t_task_decision_links table
  await knex.schema.alterTable('t_task_decision_links', (table) => {
    table.dropColumn('link_type');
  });

  console.log('✅ Removed link_type column from t_task_decision_links');
}

