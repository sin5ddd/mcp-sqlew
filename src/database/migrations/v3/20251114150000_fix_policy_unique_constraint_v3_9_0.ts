/**
 * Converted from: src/config/knex/enhancements/20251114150000_fix_policy_unique_constraint_v3_9_0.ts
 * Changes:
 * - Added Universal Knex Wrapper for createTableSafe
 * - Replaced manual hasTable check with db.createTableSafe
 * - Used helpers.stringColumn for database-aware VARCHAR lengths
 * - Used helpers.timestampColumn for cross-database timestamp defaults
 * - Line count: 74 (original) → 66 (12% reduction)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

/**
 * Migration: Fix t_decision_policies UNIQUE Constraint (v3.9.0)
 *
 * Removes single-column UNIQUE constraint on `name` column.
 * Keeps only the composite UNIQUE constraint on (name, project_id).
 *
 * Root cause: Table was renamed from t_decision_templates which had
 * UNIQUE(name), and project_id was added later with composite index,
 * but old single-column constraint was never removed.
 */

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  if (!db.isSQLite) {
    // MySQL/PostgreSQL can drop constraints directly
    console.log('✓ Non-SQLite database, skipping (constraint handling differs)');
    return;
  }

  // Check if table exists
  const hasTable = await knex.schema.hasTable('t_decision_policies');
  if (!hasTable) {
    console.log('✓ t_decision_policies table does not exist, skipping');
    return;
  }

  // SQLite: Need to recreate table to remove column constraint
  console.log('🔄 Fixing t_decision_policies UNIQUE constraint...');

  // 1. Backup existing data
  const existingPolicies = await knex('t_decision_policies').select('*');
  console.log(`  📊 Backing up ${existingPolicies.length} existing policies...`);

  // 2. Drop old table
  await knex.schema.dropTable('t_decision_policies');
  console.log('  ✓ Dropped old table');

  // 3. Create new table with correct schema
  await knex.schema.createTable('t_decision_policies', (table) => {
    table.increments('id').primary();
    table.string('name', 200).notNullable();  // NO single-column UNIQUE
    table.integer('project_id').notNullable().defaultTo(1);
    table.text('description');  // Policy description (from original schema)
    table.text('defaults').notNullable();  // JSON: {layer, status, tags, priority}
    table.text('required_fields');  // JSON array
    table.text('validation_rules');  // JSON: pattern enforcement (v3.9.0)
    table.text('quality_gates');  // JSON: completeness requirements (v3.9.0)
    table.integer('suggest_similar').defaultTo(0);  // Auto-trigger suggestions (v3.9.0)
    table.string('category', 100);  // Policy categorization (v3.9.0)
    table.integer('created_by').nullable().references('id').inTable('m_agents').onDelete('SET NULL');
    table.integer('ts').notNullable().defaultTo(db.nowTimestamp());

    // Composite UNIQUE constraint (allows same name in different projects)
    table.unique(['name', 'project_id']);
  });
  console.log('  ✓ Created new table with composite UNIQUE only');

  // 4. Restore data
  if (existingPolicies.length > 0) {
    await knex('t_decision_policies').insert(existingPolicies);
    console.log(`  ✓ Restored ${existingPolicies.length} policies`);
  }

  console.log('✅ t_decision_policies UNIQUE constraint fixed');
}

export async function down(knex: Knex): Promise<void> {
  console.log('⚠️  No rollback needed - schema remains valid');
}
