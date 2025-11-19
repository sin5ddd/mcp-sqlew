/**
 * Converted from: src/config/knex/upgrades/20251024060000_upgrade_v3_4_to_v3_5.ts
 * Line count: 46 lines → ~47 lines (minimal change)
 *
 * Knex Migration: v3.4.x → v3.5.0 (Add Pruned Files Tracking)
 *
 * Adds tracking for pruned files in tasks.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we need this migration
  const hasPrunedFiles = await knex.schema.hasTable("t_task_pruned_files");

  if (hasPrunedFiles) {
    console.log("✓ t_task_pruned_files already exists, skipping v3.5.0 migration");
    return;
  }

  // Check if we have decision context (v3.2.2+)
  const hasDecisionContext = await knex.schema.hasTable("t_decision_context");
  if (!hasDecisionContext) {
    console.log("✓ No v3.4.x schema detected, skipping v3.5.0 migration");
    return;
  }

  console.log("🔄 Migrating v3.4.x → v3.5.0 (adding pruned files tracking)...");

  // Create pruned files table
  await db.createTableSafe("t_task_pruned_files", (table, helpers) => {
    table.increments("id").primary();
    table
      .integer("task_id")
      .notNullable()
      .references("id")
      .inTable("t_tasks")
      .onDelete("CASCADE");
    table.string("file_path", 500).notNullable();
    helpers.timestampColumn("pruned_ts");
  });

  await db.createIndexSafe("t_task_pruned_files", ["task_id"], "idx_task_pruned_files_task_id");

  console.log("  ✓ Created t_task_pruned_files");
  console.log("✅ v3.4.x → v3.5.0 migration complete");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("t_task_pruned_files");
}
