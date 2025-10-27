import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Check if columns already exist
  const hasColumns = await knex.schema.hasColumn('t_decision_context', 'related_task_id');

  if (hasColumns) {
    console.log('✓ Columns already exist, skipping migration');
    return;
  }

  // Add columns without foreign key constraints for RDBMS compatibility
  // SQLite doesn't support adding FK constraints via ALTER TABLE
  await knex.schema.alterTable('t_decision_context', (table) => {
    table.integer('related_task_id').nullable();
    table.integer('related_constraint_id').nullable();
  });

  console.log('✅ Added related_task_id and related_constraint_id to t_decision_context');
}

export async function down(knex: Knex): Promise<void> {
  // Remove the columns (no foreign keys to drop)
  await knex.schema.alterTable('t_decision_context', (table) => {
    table.dropColumn('related_task_id');
    table.dropColumn('related_constraint_id');
  });

  console.log('✅ Removed related_task_id and related_constraint_id from t_decision_context');
}
