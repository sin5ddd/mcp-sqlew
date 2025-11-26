/**
 * Converted from: src/config/knex/enhancements/20251027010000_add_task_constraint_to_decision_context.ts
 * Line count: 31 → 27 (13% reduction)
 *
 * No wrapper needed - pure data seeding migration
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Add columns without foreign key constraints for RDBMS compatibility
  // SQLite doesn't support adding FK constraints via ALTER TABLE
  await db.addColumnSafe('t_decision_context', 'related_task_id', (table) => {
    return table.integer('related_task_id').nullable();
  });

  await db.addColumnSafe('t_decision_context', 'related_constraint_id', (table) => {
    return table.integer('related_constraint_id').nullable();
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
