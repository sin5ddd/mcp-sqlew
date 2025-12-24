/**
 * Converted from: src/config/knex/upgrades/20251024050000_upgrade_v3_2_0_to_v3_2_2.ts
 * Line count: 51 lines → ~52 lines (minimal change)
 *
 * Knex Migration: v3.2.0 → v3.2.2 (Add Decision Context)
 *
 * Adds rich context for decisions (rationale, alternatives, tradeoffs).
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we need this migration
  const hasDecisionContext = await knex.schema.hasTable("t_decision_context");

  if (hasDecisionContext) {
    console.error("✓ t_decision_context already exists, skipping v3.2.2 migration");
    return;
  }

  // Check if we have v3.2.0 schema (task dependencies exist)
  const hasDependencies = await knex.schema.hasTable("t_task_dependencies");
  if (!hasDependencies) {
    console.error("✓ No v3.2.0 schema detected, skipping v3.2.2 migration");
    return;
  }

  console.error("🔄 Migrating v3.2.0 → v3.2.2 (adding decision context)...");

  // Create decision context table
  await db.createTableSafe("t_decision_context", (table, helpers) => {
    table.increments("id").primary();
    table
      .integer("decision_id")
      .notNullable()
      .references("id")
      .inTable("t_decisions")
      .onDelete("CASCADE");
    table.text("rationale");
    table.text("alternatives");
    table.text("tradeoffs");
    table.integer("task_id").references("id").inTable("t_tasks").onDelete("SET NULL");
    table
      .integer("constraint_id")
      .references("id")
      .inTable("t_constraints")
      .onDelete("SET NULL");
    helpers.timestampColumn("created_ts");
  });

  await db.createIndexSafe("t_decision_context", ["decision_id"], "idx_decision_context_decision_id");
  await db.createIndexSafe("t_decision_context", ["task_id"], "idx_decision_context_task_id");

  console.error("  ✓ Created t_decision_context");
  console.error("✅ v3.2.0 → v3.2.2 migration complete");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("t_decision_context");
}
