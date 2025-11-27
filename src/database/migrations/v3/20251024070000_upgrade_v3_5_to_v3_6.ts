/**
 * Converted from: src/config/knex/upgrades/20251024070000_upgrade_v3_5_to_v3_6.ts
 * Line count: 36 lines → ~38 lines (minimal change)
 *
 * Knex Migration: v3.5.x → v3.6.0 (Add Help System)
 *
 * Adds comprehensive help system tables and metadata.
 * This migration checks if help tables already exist and skips if so.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we need this migration
  const hasHelpSystem = await knex.schema.hasTable("m_help_tools");

  if (hasHelpSystem) {
    console.log("✓ Help system tables already exist, skipping v3.6.0 migration");
    return;
  }

  // Check if we have pruned files (v3.5.x)
  const hasPrunedFiles = await knex.schema.hasTable("t_task_pruned_files");
  if (!hasPrunedFiles) {
    console.log("✓ No v3.5.x schema detected, skipping v3.6.0 migration");
    return;
  }

  console.log("🔄 Migrating v3.5.x → v3.6.0 (adding help system)...");
  console.log("  ℹ️  Help system tables will be created by migration 20251025090000");
  console.log("  ℹ️  This is just a version marker migration");

  console.log("✅ v3.5.x → v3.6.0 migration marker complete");
}

export async function down(knex: Knex): Promise<void> {
  // No action needed - actual help tables are managed by later migrations
}
