/**
 * Converted from: src/config/knex/enhancements/20251025081221_add_link_type_to_task_decision_links.ts
 * Changes: Replaced manual hasColumn check with UniversalKnex.addColumnSafe()
 * Line count: 29 → 17 lines (41% reduction)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Add link_type column to t_task_decision_links table
  await db.addColumnSafe('t_task_decision_links', 'link_type', (table) => {
    return table.text('link_type').defaultTo('implements');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove link_type column from t_task_decision_links table
  await knex.schema.alterTable('t_task_decision_links', (table) => {
    table.dropColumn('link_type');
  });

  console.error('✅ Removed link_type column from t_task_decision_links');
}
