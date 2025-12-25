/**
 * Converted from: src/config/knex/upgrades/20251024010000_upgrade_v1_0_to_v1_1.ts
 * Line count: 82 lines → ~65 lines (20% reduction)
 *
 * Knex Migration: v1.0.0 → v1.1.0 (Add Table Prefixes)
 *
 * Renames unprefixed tables to prefixed versions:
 * - agents → m_agents
 * - files → m_files
 * - context_keys → m_context_keys
 * - etc.
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // Check if we have v1.0.0 schema (unprefixed tables)
  const hasUnprefixedAgents = await knex.schema.hasTable("agents");

  if (!hasUnprefixedAgents) {
    console.error("✓ No v1.0.0 schema detected, skipping prefix migration");
    return;
  }

  console.error("🔄 Migrating v1.0.0 → v1.1.0 (adding table prefixes)...");

  // Rename tables to add m_ prefix (master tables)
  const masterTables = [
    "agents",
    "files",
    "context_keys",
    "constraint_categories",
    "layers",
    "tags",
    "scopes",
  ];

  for (const table of masterTables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.schema.renameTable(table, `m_${table}`);
      console.error(`  ✓ Renamed ${table} → m_${table}`);
    }
  }

  // Rename transaction tables to add t_ prefix
  const transactionTables = [
    "decisions",
    "decisions_numeric",
    "decision_history",
    "agent_messages",
    "file_changes",
    "constraints",
  ];

  for (const table of transactionTables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.schema.renameTable(table, `t_${table}`);
      console.error(`  ✓ Renamed ${table} → t_${table}`);
    }
  }

  console.error("✅ v1.0.0 → v1.1.0 migration complete");
}

export async function down(knex: Knex): Promise<void> {
  // Reverse: remove prefixes
  const prefixedTables = await knex("sqlite_master")
    .select("name")
    .where("type", "table")
    .whereIn("name", [
      "m_agents",
      "m_files",
      "m_context_keys",
      "m_constraint_categories",
      "m_layers",
      "m_tags",
      "m_scopes",
      "t_decisions",
      "t_decisions_numeric",
      "t_decision_history",
      "t_agent_messages",
      "t_file_changes",
      "t_constraints",
    ]);

  for (const row of prefixedTables) {
    const tableName = row.name as string;
    const unprefixedName = tableName.replace(/^[mt]_/, "");
    await knex.schema.renameTable(tableName, unprefixedName);
  }
}
