/**
 * Converted from: src/config/knex/upgrades/20251104000000_add_multi_project_v3_7_0.ts
 * Line count: 1152 lines → ~1100 lines (5% reduction - SQLite-specific migration with extensive table recreation)
 *
 * Migration: Multi-Project Support v3.7.0 (Consolidated)
 *
 * Consolidates 4 separate migrations into a single comprehensive migration:
 * - 20251101000000_add_multi_project_support (enhancements)
 * - 20251104000000_multi_project_support_v3_7_0 (upgrades)
 * - 20251104000001_multi_project_fix_constraints (upgrades)
 * - 20251104000002_hotfix_missing_project_id (upgrades)
 *
 * Adds multi-project isolation support by:
 * 1. Creating m_projects master table
 * 2. Adding project_id to all transaction tables (14 tables)
 * 3. Updating PRIMARY KEY constraints to composite (key_id, project_id)
 * 4. Recreating m_config table with proper PRIMARY KEY structure
 * 5. Adding indexes for multi-project queries
 * 6. Recreating all views with project_id support
 *
 * Migration Steps:
 * - STEP 1: Create m_projects table
 * - STEP 2: Drop all views and triggers before modifications
 * - STEP 3: Add project_id via ALTER TABLE (10 tables)
 * - STEP 4: Fix PRIMARY KEY constraints (composite keys)
 *   - STEP 4a-4b: Recreate t_decisions tables with composite PRIMARY KEY
 *   - STEP 4.5: Recreate t_task_tags with composite PRIMARY KEY
 *   - STEP 4.6: Recreate t_task_dependencies with composite PRIMARY KEY
 *   - STEP 4.7: Recreate t_task_details with project_id (ALTER TABLE fails due to FK constraints)
 *   - STEP 4.8: Recreate t_task_file_links with project_id (ALTER TABLE fails due to FK constraints)
 *   - STEP 4.9: Recreate t_task_decision_links with project_id (ALTER TABLE fails due to FK constraints)
 * - STEP 5: Recreate m_config table
 * - STEP 6: Create composite indexes
 * - STEP 7: Recreate all views with project_id support
 * - STEP 8: Re-enable foreign key constraints
 *
 * SQLite Limitation Note:
 * ALTER TABLE cannot modify tables with complex FOREIGN KEY constraints (ON DELETE CASCADE).
 * Tables requiring recreation: t_task_details, t_task_tags, t_task_file_links,
 * t_task_decision_links, t_task_dependencies.
 *
 * Satisfies Constraints:
 * - #22 (CRITICAL): All transaction tables have project_id
 * - #23 (CRITICAL): m_projects table with name/detection_source
 * - #39 (HIGH): Composite indexes with project_id first
 * - #41 (HIGH): t_task_tags composite PRIMARY KEY
 * - #42 (HIGH): t_task_dependencies composite PRIMARY KEY
 *
 * NOTE: This migration is SQLite-specific and contains extensive table recreation logic.
 * The Universal Knex Wrapper provides limited benefits due to SQLite-specific operations.
 * MySQL/PostgreSQL compatibility is handled by separate migration 20251109000002.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";
import { detectProjectNameSync } from "../../utils/project-detector.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // **BUG FIX v3.7.5**: This migration is SQLite-specific
  // MySQL/PostgreSQL compatibility handled by 20251109000002_multi_project_cross_db_compat_v3_7_5.ts
  if (!db.isSQLite) {
    console.log(`✓ Non-SQLite database detected, skipping (handled by 20251109000002)`);
    return;
  }

  // Check if migration already completed
  const hasProjectsTable = await knex.schema.hasTable("m_projects");
  const hasProjectIdInDecisions = await knex.schema.hasColumn("t_decisions", "project_id");
  const hasMigrationMarker = await knex.schema.hasTable("_multi_project_pk_fixed");

  console.log(`🔍 Multi-project migration check:`);
  console.log(`   - m_projects: ${hasProjectsTable}`);
  console.log(`   - project_id in t_decisions: ${hasProjectIdInDecisions}`);
  console.log(`   - migration marker: ${hasMigrationMarker}`);

  // If fully migrated, skip
  if (hasProjectsTable && hasProjectIdInDecisions && hasMigrationMarker) {
    console.log("✓ Multi-project schema already migrated, skipping");
    return;
  }

  console.log("🔄 Starting multi-project support migration v3.7.0 (consolidated)...");

  // Disable foreign key constraints temporarily for SQLite
  await knex.raw("PRAGMA foreign_keys = OFF");
  console.log("✓ Disabled foreign key constraints");

  // ============================================================================
  // STEP 1: Create m_projects Master Table
  // ============================================================================

  let defaultProjectId: number;

  // Detect real project name (v3.7.3 fix)
  const projectRoot = process.cwd();
  const detected = detectProjectNameSync(projectRoot);

  if (!hasProjectsTable) {
    await knex.schema.createTable("m_projects", (table) => {
      table.increments("id").primary();
      table.string("name", 64).notNullable().unique();
      table.string("display_name", 128);
      table.string("detection_source", 20).notNullable(); // 'cli' | 'config' | 'git' | 'metadata' | 'directory'
      table.string("project_root_path", 512);
      table.integer("created_ts").notNullable();
      table.integer("last_active_ts").notNullable();
      table.text("metadata"); // JSON string for extensibility
    });

    // Insert project with REAL detected name (v3.7.3 fix)
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
    console.log(`✓ Created m_projects table with project "${detected.name}" (ID: ${defaultProjectId}, source: ${detected.source})`);
  } else {
    // ========================================================================
    // Data Consolidation Strategy (v3.7.3 fix)
    // ========================================================================
    // Goal: Consolidate everything into project ID 1 with correct name
    //
    // This ONLY runs if upgrading from v3.7.0-v3.7.2 where:
    // - Project #1 was created with fake name "default" or "default-project"
    // - User manually created project #2 with real project name
    //
    // For fresh installs, project #1 is created with real name above,
    // so consolidation is skipped.

    const existingProject1 = await knex("m_projects")
      .where({ id: 1 })
      .first<{ id: number; name: string }>();

    const existingProject2 = await knex("m_projects")
      .where({ id: 2 })
      .first<{ id: number; name: string }>();

    const FAKE_NAMES = ["default-project", "default"];

    // Check if this is a v3.7.0-v3.7.2 upgrade scenario
    // (project #1 has fake name AND project #2 exists)
    const isV370UpgradeScenario = existingProject1 && existingProject2 && FAKE_NAMES.includes(existingProject1.name);

    // Perform consolidation ONLY for v3.7.0-v3.7.2 upgrades
    if (isV370UpgradeScenario) {
      console.log(`🔄 Detected v3.7.0-v3.7.2 upgrade scenario - consolidating projects...`);
      console.log(`   Project #1: "${existingProject1.name}" (fake name, empty)`);
      console.log(`   Project #2: "${existingProject2.name}" (real project, has data)`);
      console.log(`🔄 Consolidating project #2 into project #1...`);

      // STEP 1: Temporarily rename project #2 to avoid conflict
      const tempName = `temp-${existingProject2.name}-${Date.now()}`;
      await knex("m_projects").where({ id: 2 }).update({ name: tempName });
      console.log(`  ✓ Temporarily renamed project #2 to "${tempName}"`);

      // STEP 2: Rename project #1 to real detected name
      await knex("m_projects")
        .where({ id: 1 })
        .update({
          name: detected.name,
          display_name: detected.name,
          detection_source: detected.source,
          last_active_ts: Math.floor(Date.now() / 1000),
        });
      console.log(`  ✓ Renamed project #1 from "${existingProject1.name}" to "${detected.name}"`);

      // STEP 3: Migrate ALL data from project_id=2 → 1
      const tablesToUpdate = [
        "t_decisions",
        "t_decisions_numeric",
        "t_decision_history",
        "t_decision_tags",
        "t_decision_scopes",
        "t_file_changes",
        "t_constraints",
        "t_tasks",
        "t_task_tags",
        "t_task_dependencies",
        "t_task_details",
        "t_task_file_links",
        "t_task_decision_links",
        "t_activity_log",
        "t_decision_context",
      ];

      for (const tableName of tablesToUpdate) {
        const hasTable = await knex.schema.hasTable(tableName);
        if (hasTable) {
          const hasProjectId = await knex.schema.hasColumn(tableName, "project_id");
          if (hasProjectId) {
            const count = await knex(tableName).where({ project_id: 2 }).update({ project_id: 1 });
            if (count > 0) {
              console.log(`  ✓ Migrated ${count} rows in ${tableName} (project_id: 2→1)`);
            }
          }
        }
      }

      // STEP 4: Delete project #2
      await knex("m_projects").where({ id: 2 }).delete();
      console.log(`  ✓ Deleted project #2 (data consolidated into project #1)`);
      console.log(`✅ Consolidation complete - all data now in project #1 "${detected.name}"`);
    } else if (existingProject1 && FAKE_NAMES.includes(existingProject1.name)) {
      // No project #2, just rename project #1
      console.log(`🔄 Renaming project #1 from "${existingProject1.name}" to "${detected.name}"`);
      await knex("m_projects")
        .where({ id: 1 })
        .update({
          name: detected.name,
          display_name: detected.name,
          detection_source: detected.source,
          last_active_ts: Math.floor(Date.now() / 1000),
        });
      console.log(`✓ Project #1 renamed to "${detected.name}" (source: ${detected.source})`);
    } else if (existingProject1) {
      // User already has real name, don't change it
      console.log(`✓ Using existing project "${existingProject1.name}" (ID: 1)`);
    }

    // Always use project ID 1 after consolidation
    defaultProjectId = 1;
  }

  // ============================================================================
  // STEP 2: Drop All Views and Triggers (Before Table Modifications)
  // ============================================================================

  // Drop ALL views (including old schema views)
  const views = await knex.raw(`SELECT name FROM sqlite_master WHERE type='view'`);
  for (const view of views) {
    await knex.raw(`DROP VIEW IF EXISTS ${view.name}`);
  }
  console.log(`✓ Dropped all ${views.length} views before table modifications`);

  // Drop ALL triggers (old schema compatibility)
  const triggers = await knex.raw(`SELECT name FROM sqlite_master WHERE type='trigger'`);
  for (const trigger of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger.name}`);
  }
  console.log(`✓ Dropped all ${triggers.length} triggers before table modifications`);

  // Drop old t_agent_messages table if exists (removed in v3.6.5)
  await knex.schema.dropTableIfExists("t_agent_messages");
  console.log("✓ Dropped t_agent_messages if it existed (removed in v3.6.5)");

  // ============================================================================
  // STEP 3: Add project_id to Transaction Tables
  // ============================================================================

  // Helper function to add project_id column using raw SQL (more reliable for old schemas)
  async function addProjectIdColumn(tableName: string, knex: Knex, defaultProjectId: number): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(tableName, "project_id");
    if (!hasColumn) {
      // Use raw SQL to avoid Knex's schema parsing issues with old schemas
      await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN project_id INTEGER NOT NULL DEFAULT ${defaultProjectId}`);
      // Add foreign key separately
      await db.createIndexSafe(tableName, ['project_id'], `idx_${tableName}_project`);
      console.log(`✓ Added project_id to ${tableName}`);
    } else {
      console.log(`  ⏭  ${tableName} already has project_id, skipping`);
    }
  }

  // Transaction tables that need project_id
  // Note: t_decision_context is handled separately in Step 4 (after PRIMARY KEY fix)
  // Note: t_task_details, t_task_tags, t_task_dependencies are recreated in Steps 4.5-4.7 (need table recreation for constraints)
  const transactionTables = [
    "t_decision_history",
    "t_decision_tags",
    "t_decision_scopes",
    "t_file_changes",
    "t_constraints",
    "t_tasks",
    // 't_task_details', // Handled in STEP 4.7 (needs table recreation)
    // 't_task_tags', // Handled in STEP 4.5 (composite PRIMARY KEY)
    "t_task_file_links",
    "t_task_decision_links",
    // 't_task_dependencies', // Handled in STEP 4.6 (composite PRIMARY KEY)
    "t_activity_log", // Required for stats.clear to filter by project_id
  ];

  for (const tableName of transactionTables) {
    await addProjectIdColumn(tableName, knex, defaultProjectId);
  }

  // ============================================================================
  // STEP 4: Fix PRIMARY KEY Constraints (t_decisions tables)
  // ============================================================================

  // For SQLite, we need to recreate tables to change PRIMARY KEY from single-column
  // to composite (key_id, project_id)

  if (!hasMigrationMarker) {
    console.log("🔄 Fixing PRIMARY KEY constraints for t_decisions tables...");

    // Drop t_decision_context temporarily (has FK to t_decisions)
    let decisionContextData: any[] = [];
    const hasDecisionContext = await knex.schema.hasTable("t_decision_context");
    if (hasDecisionContext) {
      decisionContextData = await knex("t_decision_context").select("*");
      await knex.schema.dropTable("t_decision_context");
      console.log("✓ Temporarily dropped t_decision_context (will recreate)");
    }

    // 4a. t_decisions
    const decisionsData = await knex("t_decisions").select("*");

    await knex.schema.dropTableIfExists("t_decisions");
    await knex.schema.createTable("t_decisions", (table) => {
      table.integer("key_id").unsigned().notNullable();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.text("value").notNullable();
      table.integer("agent_id").unsigned();
      table.integer("layer_id").unsigned();
      table.string("version", 20).defaultTo("1.0.0");
      table.integer("status").defaultTo(1);
      table.integer("ts").notNullable();

      // Composite PRIMARY KEY
      table.primary(["key_id", "project_id"]);

      // Foreign keys
      table.foreign("key_id").references("m_context_keys.id");
      table.foreign("agent_id").references("m_agents.id");
      table.foreign("layer_id").references("m_layers.id");
      table.foreign("project_id").references("m_projects.id").onDelete("CASCADE");
    });

    if (decisionsData.length > 0) {
      // Ensure project_id is set for existing data
      await knex("t_decisions").insert(
        decisionsData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_decisions with composite PRIMARY KEY (${decisionsData.length} rows)`);

    // 4b. t_decisions_numeric
    const decisionsNumericData = await knex("t_decisions_numeric").select("*");

    await knex.schema.dropTableIfExists("t_decisions_numeric");
    await knex.schema.createTable("t_decisions_numeric", (table) => {
      table.integer("key_id").unsigned().notNullable();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.double("value").notNullable();
      table.integer("agent_id").unsigned();
      table.integer("layer_id").unsigned();
      table.string("version", 20).defaultTo("1.0.0");
      table.integer("status").defaultTo(1);
      table.integer("ts").notNullable();

      // Composite PRIMARY KEY
      table.primary(["key_id", "project_id"]);

      // Foreign keys
      table.foreign("key_id").references("m_context_keys.id");
      table.foreign("agent_id").references("m_agents.id");
      table.foreign("layer_id").references("m_layers.id");
      table.foreign("project_id").references("m_projects.id").onDelete("CASCADE");
    });

    if (decisionsNumericData.length > 0) {
      await knex("t_decisions_numeric").insert(
        decisionsNumericData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_decisions_numeric with composite PRIMARY KEY (${decisionsNumericData.length} rows)`);

    // Create migration marker
    await knex.schema.createTable("_multi_project_pk_fixed", (table) => {
      table.integer("applied_ts").notNullable();
    });

    await knex("_multi_project_pk_fixed").insert({
      applied_ts: Math.floor(Date.now() / 1000),
    });

    console.log("✓ Created migration marker table");

    // Recreate t_decision_context if it existed
    if (hasDecisionContext) {
      await knex.schema.createTable("t_decision_context", (table) => {
        table.increments("id").primary();
        table.integer("decision_key_id").unsigned().notNullable();
        table.text("rationale");
        table.text("alternatives_considered"); // JSON array (was 'alternatives' - fixed for compatibility)
        table.text("tradeoffs"); // JSON object
        table.integer("agent_id").unsigned();
        table.integer("decision_date").notNullable().defaultTo(knex.raw("(unixepoch())"));
        table.integer("related_task_id").unsigned();
        table.integer("related_constraint_id").unsigned();
        table.integer("ts").notNullable().defaultTo(knex.raw("(unixepoch())"));
        table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);

        // Foreign keys
        table.foreign("decision_key_id").references("m_context_keys.id");
        table.foreign("agent_id").references("m_agents.id");
        table.foreign("related_task_id").references("t_tasks.id").onDelete("SET NULL");
        table.foreign("related_constraint_id").references("t_constraints.id").onDelete("SET NULL");
        table.foreign("project_id").references("m_projects.id").onDelete("CASCADE");

        // Unique constraint
        table.unique(["decision_key_id", "id"]);
      });

      // Restore data with project_id
      if (decisionContextData.length > 0) {
        await knex("t_decision_context").insert(
          decisionContextData.map((row: any) => ({
            ...row,
            project_id: row.project_id || defaultProjectId,
          }))
        );
      }

      console.log(`✓ Recreated t_decision_context (${decisionContextData.length} rows)`);
    }
  } else {
    console.log("✓ PRIMARY KEY constraints already fixed, skipping");
  }

  // ============================================================================
  // STEP 4.5: Fix t_task_tags PRIMARY KEY (Constraint #41)
  // ============================================================================

  // t_task_tags needs composite PRIMARY KEY (project_id, task_id, tag_id)
  // to support ON CONFLICT clause for multi-project tag insertion

  const taskTagsHasCorrectPK = await knex
    .raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name='t_task_tags'`)
    .then((result: any) => {
      const createSql = result[0]?.sql || "";
      return (
        createSql.includes("PRIMARY KEY (project_id, task_id, tag_id)") ||
        createSql.includes("PRIMARY KEY(project_id, task_id, tag_id)")
      );
    });

  if (!taskTagsHasCorrectPK) {
    console.log("🔄 Fixing t_task_tags PRIMARY KEY to include project_id...");

    // Backup existing data
    const taskTagsData = await knex("t_task_tags").select("*");

    // Drop and recreate table with correct PRIMARY KEY
    await knex.schema.dropTableIfExists("t_task_tags");
    await knex.schema.createTable("t_task_tags", (table) => {
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.integer("task_id").unsigned().notNullable();
      table.integer("tag_id").unsigned().notNullable();

      // Composite PRIMARY KEY with project_id first
      table.primary(["project_id", "task_id", "tag_id"]);

      // Foreign keys
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
      table.foreign("task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
      table.foreign("tag_id").references("id").inTable("m_tags");
    });

    // Restore data with project_id
    if (taskTagsData.length > 0) {
      await knex("t_task_tags").insert(
        taskTagsData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_task_tags with composite PRIMARY KEY (${taskTagsData.length} rows)`);
  } else {
    console.log("✓ t_task_tags PRIMARY KEY already correct, skipping");
  }

  // STEP 4.6: Fix t_task_dependencies PRIMARY KEY (Constraint #42)
  // PRIMARY KEY must be (project_id, blocker_task_id, blocked_task_id) for multi-project support
  const taskDepsHasCorrectPK = await knex
    .raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'`)
    .then((result: any) => {
      const createSql = result[0]?.sql || "";
      return (
        createSql.includes("PRIMARY KEY (project_id, blocker_task_id, blocked_task_id)") ||
        createSql.includes("PRIMARY KEY(project_id, blocker_task_id, blocked_task_id)")
      );
    });

  if (!taskDepsHasCorrectPK) {
    console.log("🔄 Fixing t_task_dependencies PRIMARY KEY to include project_id...");

    // Backup existing data
    const taskDepsData = await knex("t_task_dependencies").select("*");

    // Drop and recreate table with correct PRIMARY KEY
    await knex.schema.dropTableIfExists("t_task_dependencies");
    await knex.schema.createTable("t_task_dependencies", (table) => {
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.integer("blocker_task_id").unsigned().notNullable();
      table.integer("blocked_task_id").unsigned().notNullable();
      table.integer("created_ts").notNullable().defaultTo(knex.raw("(unixepoch())"));

      // Composite PRIMARY KEY with project_id first
      table.primary(["project_id", "blocker_task_id", "blocked_task_id"]);

      // Foreign keys
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
      table.foreign("blocker_task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
      table.foreign("blocked_task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
    });

    await db.createIndexSafe('t_task_dependencies', ['blocked_task_id', 'project_id'], 'idx_task_deps_blocked');

    // Restore data with project_id
    if (taskDepsData.length > 0) {
      await knex("t_task_dependencies").insert(
        taskDepsData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_task_dependencies with composite PRIMARY KEY (${taskDepsData.length} rows)`);
  } else {
    console.log("✓ t_task_dependencies PRIMARY KEY already correct, skipping");
  }

  // ============================================================================
  // STEP 4.7: Fix t_task_details (Add project_id - needs table recreation)
  // ============================================================================

  const taskDetailsHasProjectId = await knex.schema.hasColumn("t_task_details", "project_id");

  if (!taskDetailsHasProjectId) {
    console.log("🔄 Adding project_id to t_task_details (requires table recreation due to FK)...");

    const taskDetailsExists = await knex.schema.hasTable("t_task_details");
    let taskDetailsData: any[] = [];

    if (taskDetailsExists) {
      taskDetailsData = await knex("t_task_details").select("*");
      await knex.schema.dropTable("t_task_details");
    }

    await knex.schema.createTable("t_task_details", (table) => {
      table.integer("task_id").unsigned().notNullable();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.text("notes");
      table.text("acceptance_criteria");
      table.text("blocking_issues");
      table.bigInteger("estimated_hours");
      table.integer("actual_hours");
      table.integer("updated_ts").notNullable().defaultTo(knex.raw("(unixepoch())"));

      // Composite PRIMARY KEY
      table.primary(["task_id", "project_id"]);

      // Foreign keys
      table.foreign("task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
    });

    if (taskDetailsData.length > 0) {
      await knex("t_task_details").insert(
        taskDetailsData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_task_details with project_id (${taskDetailsData.length} rows)`);
  } else {
    console.log("✓ t_task_details already has project_id, skipping");
  }

  // ============================================================================
  // STEP 4.8: Fix t_task_file_links (Add project_id - needs table recreation)
  // ============================================================================

  const taskFileLinksHasProjectId = await knex.schema.hasColumn("t_task_file_links", "project_id");

  if (!taskFileLinksHasProjectId) {
    console.log("🔄 Adding project_id to t_task_file_links (requires table recreation due to FK)...");

    const taskFileLinksData = await knex("t_task_file_links").select("*");
    await knex.schema.dropTable("t_task_file_links");

    await knex.schema.createTable("t_task_file_links", (table) => {
      table.integer("task_id").unsigned().notNullable();
      table.integer("file_id").unsigned().notNullable();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.bigInteger("linked_ts").notNullable().defaultTo(knex.raw("(unixepoch())"));

      // UNIQUE constraint on (project_id, task_id, file_id) for ON CONFLICT DO NOTHING
      table.unique(["project_id", "task_id", "file_id"]);

      // Foreign keys
      table.foreign("task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
      table.foreign("file_id").references("id").inTable("m_files").onDelete("CASCADE");
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
    });

    if (taskFileLinksData.length > 0) {
      await knex("t_task_file_links").insert(
        taskFileLinksData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_task_file_links with project_id (${taskFileLinksData.length} rows)`);
  } else {
    console.log("✓ t_task_file_links already has project_id, skipping");
  }

  // ============================================================================
  // STEP 4.9: Fix t_task_decision_links (Add project_id if it doesn't exist)
  // ============================================================================

  const taskDecisionLinksHasProjectId = await knex.schema.hasColumn("t_task_decision_links", "project_id");

  if (!taskDecisionLinksHasProjectId) {
    console.log("🔄 Adding project_id to t_task_decision_links (requires table recreation due to FK)...");

    const taskDecisionLinksData = await knex("t_task_decision_links").select("*");
    await knex.schema.dropTable("t_task_decision_links");

    await knex.schema.createTable("t_task_decision_links", (table) => {
      table.integer("task_id").unsigned().notNullable();
      table.integer("decision_id").unsigned().notNullable();
      table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
      table.text("link_type").defaultTo("implements");
      table.bigInteger("linked_ts").notNullable().defaultTo(knex.raw("(unixepoch())"));

      // Composite PRIMARY KEY
      table.primary(["task_id", "decision_id", "project_id"]);

      // Foreign keys
      table.foreign("task_id").references("id").inTable("t_tasks").onDelete("CASCADE");
      table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
    });

    if (taskDecisionLinksData.length > 0) {
      await knex("t_task_decision_links").insert(
        taskDecisionLinksData.map((row: any) => ({
          ...row,
          project_id: row.project_id || defaultProjectId,
        }))
      );
    }

    console.log(`✓ Recreated t_task_decision_links with project_id (${taskDecisionLinksData.length} rows)`);
  } else {
    console.log("✓ t_task_decision_links already has project_id, skipping");
  }

  // ============================================================================
  // STEP 5: Recreate m_config Table
  // ============================================================================

  console.log("🔄 Recreating m_config table with project_id and composite PRIMARY KEY...");

  const configData = await knex("m_config").select("*");
  await knex.schema.dropTable("m_config");

  await knex.schema.createTable("m_config", (table) => {
    table.string("key", 128).notNullable();
    table.integer("project_id").unsigned().notNullable().defaultTo(defaultProjectId);
    table.text("value").notNullable();
    table.integer("updated_ts").notNullable().defaultTo(knex.raw("(unixepoch())"));

    // Composite PRIMARY KEY (key, project_id)
    table.primary(["key", "project_id"]);

    // Foreign key
    table.foreign("project_id").references("id").inTable("m_projects").onDelete("CASCADE");
  });

  if (configData.length > 0) {
    await knex("m_config").insert(
      configData.map((row: any) => ({
        ...row,
        project_id: row.project_id || defaultProjectId,
      }))
    );
  }

  console.log(`✓ Recreated m_config with composite PRIMARY KEY (${configData.length} rows)`);

  // ============================================================================
  // STEP 6: Create Composite Indexes (Constraint #39)
  // ============================================================================

  console.log("🔄 Creating composite indexes with project_id first (Constraint #39)...");

  // Create indexes with project_id first for optimal query performance
  await db.createIndexSafe('t_decisions', ['project_id', 'key_id', 'ts DESC'], 'idx_decisions_project_key');
  await db.createIndexSafe('t_decisions_numeric', ['project_id', 'key_id', 'ts DESC'], 'idx_decisions_numeric_project_key');
  await db.createIndexSafe('t_decision_tags', ['project_id', 'tag_id'], 'idx_decision_tags_project');
  await db.createIndexSafe('t_decision_scopes', ['project_id', 'scope_id'], 'idx_decision_scopes_project');
  await db.createIndexSafe('t_file_changes', ['project_id', 'file_id'], 'idx_file_changes_project');
  await db.createIndexSafe('t_constraints', ['project_id', 'priority DESC'], 'idx_constraints_project_priority');
  await db.createIndexSafe('t_tasks', ['project_id', 'status_id', 'priority DESC'], 'idx_tasks_project_status');
  await db.createIndexSafe('t_task_tags', ['project_id', 'tag_id'], 'idx_task_tags_project');
  await db.createIndexSafe('t_task_file_links', ['project_id', 'task_id', 'file_id'], 'idx_task_file_links_project');
  await db.createIndexSafe('t_task_decision_links', ['project_id', 'task_id', 'decision_id'], 'idx_task_decision_links_project');

  console.log("✓ Created composite indexes with project_id first");

  // ============================================================================
  // STEP 7: Recreate All Views with Multi-Project Support
  // ============================================================================

  console.log("🔄 Recreating all views with project_id support...");

  // v_tagged_decisions
  await knex.raw(`
    CREATE VIEW v_tagged_decisions AS
    SELECT d.key_id,
           d.project_id,
           k.key as decision_key,
           d.value,
           l.name as layer,
           d.version,
           d.status,
           datetime(d.ts, 'unixepoch') as timestamp
    FROM t_decisions d
    LEFT JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    ORDER BY d.ts DESC
  `);

  // v_active_context
  await knex.raw(`
    CREATE VIEW v_active_context AS
    SELECT k.key,
           d.project_id,
           d.value,
           l.name as layer,
           datetime(d.ts, 'unixepoch') as last_updated
    FROM t_decisions d
    INNER JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    WHERE d.status = 1
    ORDER BY d.ts DESC
  `);

  // v_layer_summary
  await knex.raw(`
    CREATE VIEW v_layer_summary AS
    SELECT l.name as layer,
           d.project_id,
           COUNT(*) as decision_count
    FROM t_decisions d
    INNER JOIN m_layers l ON d.layer_id = l.id
    WHERE d.status = 1
    GROUP BY l.id, l.name, d.project_id
    ORDER BY COUNT(*) DESC
  `);

  // v_recent_file_changes
  await knex.raw(`
    CREATE VIEW v_recent_file_changes AS
    SELECT f.path,
           fc.project_id,
           a.name as changed_by,
           datetime(fc.ts, 'unixepoch') as changed_at
    FROM t_file_changes fc
    INNER JOIN m_files f ON fc.file_id = f.id
    LEFT JOIN m_agents a ON fc.agent_id = a.id
    ORDER BY fc.ts DESC
    LIMIT 50
  `);

  // v_tagged_constraints
  await knex.raw(`
    CREATE VIEW v_tagged_constraints AS
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           datetime(c.ts, 'unixepoch') as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = 1
    ORDER BY c.priority DESC, c.ts DESC
  `);

  // v_task_board
  await knex.raw(`
    CREATE VIEW v_task_board AS
    SELECT t.id,
           t.title,
           t.project_id,
           s.name as status,
           t.priority,
           t.assigned_agent,
           a.name as created_by,
           datetime(t.created_ts, 'unixepoch') as created_at,
           datetime(t.updated_ts, 'unixepoch') as updated_at
    FROM t_tasks t
    INNER JOIN m_task_statuses s ON t.status_id = s.id
    LEFT JOIN m_agents a ON t.created_by_agent_id = a.id
    ORDER BY t.priority DESC, t.created_ts DESC
  `);

  console.log("✓ Recreated all views with project_id support");

  // ============================================================================
  // STEP 8: Re-enable Foreign Key Constraints
  // ============================================================================

  await knex.raw("PRAGMA foreign_keys = ON");
  console.log("✓ Re-enabled foreign key constraints");

  console.log("✅ Multi-project support migration v3.7.0 (consolidated) complete!");
}

export async function down(knex: Knex): Promise<void> {
  console.log("⚠️  Rollback not supported for multi-project migration (data migration is one-way)");
  console.log("   To rollback, restore from backup taken before migration");
}
