/**
 * Converted from: src/config/knex/upgrades/20251109000002_multi_project_cross_db_compat_v3_7_5.ts
 * Line count: 348 lines → ~290 lines (17% reduction)
 *
 * Migration: Multi-Project Cross-Database Compatibility v3.7.5
 * Date: 2025-11-09
 * Version: v3.7.5
 *
 * CONTEXT:
 * The original multi-project migration (20251104000000) was SQLite-specific.
 * This migration provides MySQL/PostgreSQL/MariaDB compatibility by implementing
 * the same schema changes with database-agnostic syntax.
 *
 * CHANGES:
 * - Implements 20251104000000 changes for MySQL/PostgreSQL/MariaDB
 * - Skips on SQLite (already handled by 20251104000000)
 * - Uses database-specific syntax (SET FOREIGN_KEY_CHECKS vs PRAGMA)
 * - Replaces sqlite_master queries with INFORMATION_SCHEMA
 *
 * IDEMPOTENCY:
 * - Checks if m_projects exists (skip if already migrated)
 * - Checks database type (skip if SQLite)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";
import { detectProjectNameSync } from "../../utils/project-detector.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Skip on SQLite (handled by 20251104000000)
  if (db.isSQLite) {
    console.log("✓ SQLite database detected, skipping (handled by 20251104000000)");
    return;
  }

  console.log(`🔧 Multi-project cross-database compatibility for ${db.isMySQL ? "MySQL" : "PostgreSQL"}...`);

  // Check if already migrated
  const hasProjectsTable = await knex.schema.hasTable("m_projects");
  const hasProjectIdInDecisions = await knex.schema.hasColumn("t_decisions", "project_id");

  if (hasProjectsTable && hasProjectIdInDecisions) {
    console.log("✓ Multi-project schema already migrated, skipping");
    return;
  }

  // Disable foreign key checks (MySQL only)
  if (db.isMySQL) {
    await knex.raw("SET FOREIGN_KEY_CHECKS=0");
    console.log("✓ Disabled foreign key constraints (MySQL)");
  }

  // ============================================================================
  // STEP 1: Create m_projects Master Table
  // ============================================================================

  let defaultProjectId: number;

  const projectRoot = process.cwd();
  const detected = detectProjectNameSync(projectRoot);

  if (!hasProjectsTable) {
    await db.createTableSafe("m_projects", (table, helpers) => {
      table.increments("id").primary();
      table.string("name", 200).notNullable();
      table.string("display_name", 200);
      table.text("description");
      table.string("detection_source", 50);
      helpers.timestampColumn("created_ts");
      helpers.timestampColumn("last_active_ts");
    });

    const now = Math.floor(Date.now() / 1000);
    await knex("m_projects").insert({
      id: 1,
      name: detected.name,
      display_name: detected.name,
      detection_source: detected.source,
      created_ts: now,
      last_active_ts: now,
    });

    defaultProjectId = 1;
    console.log(`✓ Created m_projects table with project "${detected.name}"`);
  } else {
    defaultProjectId = 1;
    console.log("✓ m_projects table already exists");
  }

  // ============================================================================
  // STEP 2: Drop All Views (Database-Agnostic)
  // ============================================================================

  const viewsToDrop = [
    "v_tagged_decisions",
    "v_active_context",
    "v_layer_summary",
    "v_unread_messages_by_priority",
    "v_recent_file_changes",
    "v_tagged_constraints",
    "v_task_board",
  ];

  for (const viewName of viewsToDrop) {
    await knex.raw(`DROP VIEW IF EXISTS ${viewName}`);
  }
  console.log(`✓ Dropped ${viewsToDrop.length} views before table modifications`);

  // Drop old t_agent_messages table if exists (removed in v3.6.5)
  await knex.schema.dropTableIfExists("t_agent_messages");
  console.log("✓ t_agent_messages dropped if it existed (removed in v3.6.5)");

  // ============================================================================
  // STEP 3: Add project_id to Transaction Tables
  // ============================================================================

  const transactionTables = [
    "t_decision_history",
    "t_decision_tags",
    "t_decision_scopes",
    "t_file_changes",
    "t_constraints",
    "t_tasks",
    "t_task_file_links",
    "t_task_decision_links",
    "t_activity_log",
  ];

  for (const tableName of transactionTables) {
    const hasTable = await knex.schema.hasTable(tableName);
    if (hasTable) {
      await db.addColumnSafe(tableName, "project_id", (table) =>
        table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId)
      );
    }
  }

  // ============================================================================
  // STEP 4: Recreate t_decisions Tables with Composite PRIMARY KEY
  // ============================================================================

  // For MySQL/PostgreSQL, we need to drop and recreate tables to change PRIMARY KEY
  // (MySQL doesn't support ALTER TABLE ... DROP PRIMARY KEY easily with auto_increment)

  const hasDecisionsTable = await knex.schema.hasTable("t_decisions");
  if (hasDecisionsTable) {
    const decisionsData = await knex("t_decisions").select("*");
    const decisionContextData = (await knex.schema.hasTable("t_decision_context"))
      ? await knex("t_decision_context").select("*")
      : [];

    // Drop dependent table first
    await knex.schema.dropTableIfExists("t_decision_context");

    // Drop and recreate t_decisions
    await knex.schema.dropTable("t_decisions");
    await knex.schema.createTable("t_decisions", (table) => {
      table.integer("key_id").unsigned();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.text("value").notNullable();
      table.integer("agent_id").unsigned();
      table.integer("layer_id").unsigned();
      table.string("version", 20).defaultTo("1.0.0");
      table.integer("status").defaultTo(1);
      table.integer("ts").notNullable();
      table.primary(["key_id", "project_id"]);
      table.foreign("key_id").references("id").inTable("m_context_keys");
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
      table.foreign("agent_id").references("id").inTable("m_agents");
      table.foreign("layer_id").references("id").inTable("m_layers");
    });

    if (decisionsData.length > 0) {
      await knex("t_decisions").insert(decisionsData);
    }
    console.log(`✓ Recreated t_decisions with composite PRIMARY KEY (${decisionsData.length} rows)`);

    // Recreate t_decisions_numeric
    const decisionsNumericData = (await knex.schema.hasTable("t_decisions_numeric"))
      ? await knex("t_decisions_numeric").select("*")
      : [];

    if (await knex.schema.hasTable("t_decisions_numeric")) {
      await knex.schema.dropTable("t_decisions_numeric");
    }

    await knex.schema.createTable("t_decisions_numeric", (table) => {
      table.integer("key_id").unsigned();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.double("value").notNullable();
      table.integer("agent_id").unsigned();
      table.integer("layer_id").unsigned();
      table.string("version", 20).defaultTo("1.0.0");
      table.integer("status").defaultTo(1);
      table.integer("ts").notNullable();
      table.primary(["key_id", "project_id"]);
      table.foreign("key_id").references("id").inTable("m_context_keys");
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
      table.foreign("agent_id").references("id").inTable("m_agents");
      table.foreign("layer_id").references("id").inTable("m_layers");
    });

    if (decisionsNumericData.length > 0) {
      await knex("t_decisions_numeric").insert(decisionsNumericData);
    }
    console.log(`✓ Recreated t_decisions_numeric with composite PRIMARY KEY (${decisionsNumericData.length} rows)`);

    // Recreate t_decision_context
    await knex.schema.createTable("t_decision_context", (table) => {
      table.increments("id").primary();
      table.integer("decision_key_id").unsigned();
      table.foreign("decision_key_id").references("id").inTable("m_context_keys");
      table.text("rationale");
      table.text("alternatives_considered");
      table.text("tradeoffs");
      table.integer("decision_date");
      table.integer("agent_id").unsigned();
      table.foreign("agent_id").references("id").inTable("m_agents");
      table.integer("ts").notNullable();
    });

    if (decisionContextData.length > 0) {
      await knex("t_decision_context").insert(decisionContextData);
    }
  }

  // Create migration marker table
  await knex.schema.createTable("_multi_project_pk_fixed", (table) => {
    table.integer("migrated_ts").notNullable();
  });
  await knex("_multi_project_pk_fixed").insert({
    migrated_ts: Math.floor(Date.now() / 1000),
  });

  // ============================================================================
  // STEP 4.5: Add UNIQUE Constraint to t_task_file_links
  // ============================================================================

  try {
    await db.createIndexSafe("t_task_file_links", ["project_id", "task_id", "file_id"], "idx_task_file_links_unique", {
      unique: true,
    });
    console.log("✓ Created UNIQUE constraint on t_task_file_links (project_id, task_id, file_id)");
  } catch (error: any) {
    if (
      error.message &&
      (error.message.includes("already exists") || error.message.includes("Duplicate key name"))
    ) {
      console.log("✓ UNIQUE constraint already exists on t_task_file_links");
    } else {
      throw error;
    }
  }

  // ============================================================================
  // STEP 5: Recreate Views
  // ============================================================================

  const timestampFunc = db.isMySQL
    ? "FROM_UNIXTIME"
    : db.isPostgreSQL
    ? "TO_TIMESTAMP"
    : "CAST";

  const activeValue = db.isPostgreSQL ? "TRUE" : "1";

  // v_tagged_decisions
  await db.createViewSafe(
    "v_tagged_decisions",
    `
    SELECT d.key_id,
           d.project_id,
           k.key as decision_key,
           d.value,
           l.name as layer,
           d.version,
           d.status,
           ${db.isMySQL ? "FROM_UNIXTIME(d.ts)" : db.isPostgreSQL ? "TO_TIMESTAMP(d.ts)" : "d.ts"} as timestamp
    FROM t_decisions d
    LEFT JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    ORDER BY d.ts DESC
  `
  );

  // v_tagged_constraints
  await db.createViewSafe(
    "v_tagged_constraints",
    `
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           ${db.isMySQL ? "FROM_UNIXTIME(c.ts)" : db.isPostgreSQL ? "TO_TIMESTAMP(c.ts)" : "c.ts"} as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = ${activeValue}
    ORDER BY c.priority DESC, c.ts DESC
  `
  );

  console.log("✓ Recreated views with project_id support");

  // Re-enable foreign key checks (MySQL)
  if (db.isMySQL) {
    await knex.raw("SET FOREIGN_KEY_CHECKS=1");
    console.log("✓ Re-enabled foreign key constraints (MySQL)");
  }

  console.log("✅ Multi-project cross-database migration completed successfully");
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Skip on SQLite
  if (db.isSQLite) {
    console.log("✓ SQLite database detected, skipping rollback");
    return;
  }

  console.log("⏪ Rolling back multi-project cross-database migration...");
  console.log("⚠️  Rollback not implemented - migration is one-way for non-SQLite databases");
}
