/**
 * Converted from: src/config/knex/upgrades/20251024040000_upgrade_v3_0_to_v3_2.ts
 * Line count: 47 lines → ~48 lines (minimal change)
 *
 * Knex Migration: v3.0.x → v3.2.0 (Add Task Dependencies)
 *
 * Adds task dependency tracking with circular dependency detection.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we need this migration
  const hasDependencies = await knex.schema.hasTable("t_task_dependencies");

  if (hasDependencies) {
    console.log("✓ t_task_dependencies already exists, skipping v3.2.0 migration");
    return;
  }

  // Check if we have v3.0.x schema (task tables exist)
  const hasTaskTables = await knex.schema.hasTable("t_tasks");
  if (!hasTaskTables) {
    console.log("✓ No v3.0.x schema detected, skipping v3.2.0 migration");
    return;
  }

  console.log("🔄 Migrating v3.0.x → v3.2.0 (adding task dependencies)...");

  // Create task dependencies table
  await db.createTableSafe("t_task_dependencies", (table, helpers) => {
    table
      .integer("blocker_task_id")
      .notNullable()
      .references("id")
      .inTable("t_tasks")
      .onDelete("CASCADE");
    table
      .integer("blocked_task_id")
      .notNullable()
      .references("id")
      .inTable("t_tasks")
      .onDelete("CASCADE");
    helpers.timestampColumn("created_ts");
    table.primary(["blocker_task_id", "blocked_task_id"]);
  });

  await db.createIndexSafe("t_task_dependencies", ["blocked_task_id"], "idx_task_deps_blocked");

  console.log("  ✓ Created t_task_dependencies");
  console.log("✅ v3.0.x → v3.2.0 migration complete");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("t_task_dependencies");
}
