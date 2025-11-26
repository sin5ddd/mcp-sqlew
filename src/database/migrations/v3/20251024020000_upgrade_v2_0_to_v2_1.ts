/**
 * Converted from: src/config/knex/upgrades/20251024020000_upgrade_v2_0_to_v2_1.ts
 * Line count: 46 lines → ~50 lines (minimal increase for wrapper usage)
 *
 * Knex Migration: v2.0.0 → v2.1.0 (Add Activity Log & Features)
 *
 * Adds:
 * - t_activity_log table
 * - Additional columns for version and timestamps
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we need this migration (activity log doesn't exist yet)
  const hasActivityLog = await knex.schema.hasTable("t_activity_log");

  if (hasActivityLog) {
    console.log("✓ t_activity_log already exists, skipping v2.1.0 migration");
    return;
  }

  // Check if we have prefixed tables (v1.1.0+/v2.0.0)
  const hasPrefixedTables = await knex.schema.hasTable("m_agents");
  if (!hasPrefixedTables) {
    console.log("✓ No v2.0.0 schema detected, skipping v2.1.0 migration");
    return;
  }

  console.log("🔄 Migrating v2.0.0 → v2.1.0 (adding activity log)...");

  // Create activity log table
  await db.createTableSafe("t_activity_log", (table, helpers) => {
    table.increments("id").primary();
    helpers.timestampColumn("ts");
    table.string("action_type", 50).notNullable();
    table.text("details");
  });

  // Create index
  await db.createIndexSafe("t_activity_log", ["ts"], "idx_activity_log_ts");

  console.log("  ✓ Created t_activity_log table");
  console.log("✅ v2.0.0 → v2.1.0 migration complete");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("t_activity_log");
}
