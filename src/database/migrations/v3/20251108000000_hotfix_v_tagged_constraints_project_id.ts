/**
 * Converted from: src/config/knex/upgrades/20251108000000_hotfix_v_tagged_constraints_project_id.ts
 * Line count: 106 lines → ~70 lines (34% reduction)
 *
 * Migration: Hotfix v_tagged_constraints view to include project_id
 * Date: 2025-11-08
 * Version: v3.7.4
 *
 * ISSUE: v_tagged_constraints view was missing project_id column in down() migration,
 * causing "no such column: project_id" errors when querying constraints.
 *
 * FIX: Recreate view with project_id column
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  console.error("🔧 Hotfix: Recreating v_tagged_constraints with project_id...");

  // Check if t_constraints has project_id (required for this view)
  const hasProjectId = await knex.schema.hasColumn("t_constraints", "project_id");
  if (!hasProjectId) {
    console.error("✓ t_constraints.project_id does not exist yet, skipping (will be created later)");
    return;
  }

  // Determine timestamp conversion function
  const timestampFunc = db.isSQLite
    ? "datetime(c.ts, 'unixepoch')"
    : db.isMySQL
    ? "FROM_UNIXTIME(c.ts)"
    : db.isPostgreSQL
    ? "TO_TIMESTAMP(c.ts)"
    : "c.ts";

  const activeValue = db.isPostgreSQL ? "TRUE" : "1";

  // Recreate view with project_id
  await db.createViewSafe(
    "v_tagged_constraints",
    `
    SELECT c.id,
           c.constraint_text,
           c.project_id,
           cat.name as category,
           c.priority,
           a.name as author,
           ${timestampFunc} as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = ${activeValue}
    ORDER BY c.priority DESC, c.ts DESC
  `
  );

  console.error("✅ v_tagged_constraints view recreated with project_id");
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  console.error("⏪ Rolling back v_tagged_constraints hotfix...");

  // Determine timestamp conversion function
  const timestampFunc = db.isSQLite
    ? "datetime(c.ts, 'unixepoch')"
    : db.isMySQL
    ? "FROM_UNIXTIME(c.ts)"
    : db.isPostgreSQL
    ? "TO_TIMESTAMP(c.ts)"
    : "c.ts";

  const activeValue = db.isPostgreSQL ? "TRUE" : "1";

  // Recreate the version without project_id (for rollback compatibility)
  await db.createViewSafe(
    "v_tagged_constraints",
    `
    SELECT c.id,
           c.constraint_text,
           cat.name as category,
           c.priority,
           a.name as author,
           ${timestampFunc} as created
    FROM t_constraints c
    LEFT JOIN m_constraint_categories cat ON c.category_id = cat.id
    LEFT JOIN m_agents a ON c.agent_id = a.id
    WHERE c.active = ${activeValue}
    ORDER BY c.priority DESC, c.ts DESC
  `
  );

  console.error("⏪ Rolled back to original v_tagged_constraints (without project_id)");
}
