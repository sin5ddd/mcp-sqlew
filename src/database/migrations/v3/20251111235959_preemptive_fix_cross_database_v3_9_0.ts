/**
 * Converted from: src/config/knex/upgrades/20251111235959_preemptive_fix_cross_database_v3_9_0.ts
 * Line count: 234 lines → ~140 lines (40% reduction)
 *
 * Migration: Pre-emptive Cross-Database Compatibility Fix (v3.9.0)
 *
 * Purpose: This migration runs BEFORE 20251112000000_decision_intelligence_v3_9_0.ts
 * to add problematic columns with database-aware syntax.
 *
 * Problem: The original migration uses SQLite-specific strftime('%s', 'now')
 * which fails on PostgreSQL/MySQL.
 *
 * Solution: Add the columns here with proper cross-database syntax, then the
 * original migration will detect them and skip (due to hasColumn checks).
 *
 * Note: This is a hotfix migration. We cannot edit the pushed upgrade migration.
 * Timestamp 20251111235959 ensures this runs just before 20251112000000.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Only run on MySQL/PostgreSQL - let original migration handle SQLite
  if (db.isSQLite) {
    console.error("✓ SQLite: Skipping pre-emptive fix (original migration works fine)");
    return;
  }

  console.error(`🔧 Pre-emptive cross-database fix for ${db.isMySQL ? "MySQL" : "PostgreSQL"}...`);

  // ============================================================================
  // Pre-fix t_decision_policies columns (before 20251112000000 runs)
  // ============================================================================

  const hasPoliciesTable = await knex.schema.hasTable("t_decision_policies");

  if (!hasPoliciesTable) {
    console.error("  ⏭️  Pre-creating t_decision_policies table...");

    await db.createTableSafe("t_decision_policies", (table, helpers) => {
      table.increments("id").primary();
      table.string("name", 200).notNullable();
      table
        .integer("project_id")
        .unsigned() // Must match m_projects.id (UNSIGNED)
        .notNullable()
        .references("id")
        .inTable("m_projects")
        .onDelete("CASCADE");
      table.text("description");
      table.text("defaults"); // JSON
      table.text("required_fields"); // JSON
      table
        .integer("created_by")
        .unsigned() // Must match m_agents.id (UNSIGNED)
        .nullable()
        .references("id")
        .inTable("m_agents")
        .onDelete("SET NULL");
      helpers.timestampColumn("ts");
      table.unique(["name", "project_id"]);
    });

    console.error("  ✅ Pre-created t_decision_policies table");
  } else {
    const hasProjectId = await knex.schema.hasColumn("t_decision_policies", "project_id");
    const hasCreatedBy = await knex.schema.hasColumn("t_decision_policies", "created_by");
    const hasTs = await knex.schema.hasColumn("t_decision_policies", "ts");

    if (!hasProjectId || !hasCreatedBy || !hasTs) {
      console.error("  ⏭️  Pre-adding columns to t_decision_policies...");

      if (!hasProjectId) {
        await db.addColumnSafe("t_decision_policies", "project_id", (table) =>
          table.integer("project_id").unsigned().notNullable().defaultTo(1)
        );
      }

      if (!hasCreatedBy) {
        await db.addColumnSafe("t_decision_policies", "created_by", (table) =>
          table.integer("created_by").unsigned().nullable()
        );
      }

      if (!hasTs) {
        await db.addColumnSafe("t_decision_policies", "ts", (table) =>
          table.integer("ts").nullable()
        );

        // Populate ts column with current timestamp
        const currentTs = Math.floor(Date.now() / 1000);
        await knex("t_decision_policies").update({ ts: currentTs });

        // Make ts NOT NULL with database-specific syntax
        if (db.isMySQL) {
          await knex.raw("ALTER TABLE t_decision_policies MODIFY ts INT NOT NULL");
        } else if (db.isPostgreSQL) {
          await knex.raw("ALTER TABLE t_decision_policies ALTER COLUMN ts SET NOT NULL");
        }
      }

      console.error("  ✅ Pre-added columns to t_decision_policies");
    } else {
      console.error("  ✓ Columns already exist, skipping");
    }
  }

  // ============================================================================
  // Pre-create m_tag_index table (with VARCHAR instead of TEXT)
  // ============================================================================

  await db.createTableSafe("m_tag_index", (table) => {
    // Use VARCHAR(191) instead of TEXT for PRIMARY KEY (MySQL/MariaDB requirement)
    table.string("tag_name", 191).notNullable();
    table.integer("decision_count").notNullable().defaultTo(0);
    table.integer("constraint_count").notNullable().defaultTo(0);
    table.integer("task_count").notNullable().defaultTo(0);
    table.integer("total_count").notNullable().defaultTo(0);
    table.primary(["tag_name"]);
  });

  console.error("  ✅ Pre-created m_tag_index table (if it didn't exist)");

  // ============================================================================
  // Pre-create t_decision_pruning_log table
  // ============================================================================

  const hasPruningLog = await knex.schema.hasTable("t_decision_pruning_log");

  if (!hasPruningLog) {
    console.error("  ⏭️  Pre-creating t_decision_pruning_log table...");

    await knex.schema.createTable("t_decision_pruning_log", (table) => {
      table.increments("id").primary();
      table.integer("original_decision_id").notNullable();
      table.string("original_key", 256).notNullable();
      table.text("original_value").notNullable();
      table.integer("original_version").notNullable();
      table.bigInteger("original_ts").notNullable();
      table.integer("project_id").notNullable().defaultTo(1);
      table.bigInteger("pruned_ts").nullable();
    });

    // Make pruned_ts NOT NULL
    if (db.isMySQL) {
      await knex.raw("ALTER TABLE t_decision_pruning_log MODIFY pruned_ts BIGINT NOT NULL");
    } else if (db.isPostgreSQL) {
      await knex.raw("ALTER TABLE t_decision_pruning_log ALTER COLUMN pruned_ts SET NOT NULL");
    }

    console.error("  ✅ Pre-created t_decision_pruning_log table");
  } else {
    console.error("  ✓ t_decision_pruning_log already exists");
  }

  // ============================================================================
  // Pre-create t_task_pruned_files table
  // ============================================================================

  await db.createTableSafe("t_task_pruned_files", (table, helpers) => {
    table.increments("id").primary();
    table
      .integer("task_id")
      .unsigned() // Must match t_tasks.id (UNSIGNED)
      .notNullable()
      .references("id")
      .inTable("t_tasks")
      .onDelete("CASCADE");
    table.string("file_path", 500).notNullable();
    helpers.timestampColumn("pruned_ts");
    table
      .integer("linked_decision_key_id")
      .unsigned() // Must match m_context_keys.id (UNSIGNED)
      .nullable()
      .references("id")
      .inTable("m_context_keys")
      .onDelete("SET NULL");
    table
      .integer("project_id")
      .unsigned() // Must match m_projects.id (UNSIGNED)
      .notNullable()
      .references("id")
      .inTable("m_projects")
      .onDelete("CASCADE");
    table.unique(["task_id", "file_path"]);
  });

  console.error("  ✅ Pre-created t_task_pruned_files table (if it didn't exist)");

  // ============================================================================
  // Pre-create system agent (to prevent INSERT destructuring error)
  // ============================================================================

  const systemAgent = await knex("m_agents").where("name", "system").first();

  if (!systemAgent) {
    console.error("  ⏭️  Pre-creating system agent...");

    await knex("m_agents").insert({
      name: "system",
      last_active_ts: Math.floor(Date.now() / 1000),
    });

    console.error("  ✅ Pre-created system agent");
  } else {
    console.error("  ✓ System agent already exists");
  }

  console.error("✅ Pre-emptive cross-database fix completed successfully");
  console.error("   Original migration will detect these changes and skip problematic steps");
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  if (db.isSQLite) {
    console.error("✓ SQLite: No rollback needed");
    return;
  }

  // This is a pre-emptive hotfix, so down() should not break the database
  console.error("⚠️  Pre-emptive fix rollback: Not dropping columns/tables to preserve data");
  console.error("   The original migration owns these structures");
}
