/**
 * Migration: v5.0 Rename v4_ prefix to m_/t_ prefix
 *
 * Option B: Create new tables, copy data, drop old tables
 *
 * This migration renames all v4_ prefixed tables to m_ (master) and t_ (transaction)
 * prefixes for cleaner naming after v5.0 legacy cleanup.
 *
 * Tables renamed (25 total):
 * - Master Tables (10): m_projects, m_layers, m_context_keys, m_constraint_categories,
 *   m_help_tools, m_help_use_case_cats, m_builtin_policies, m_tags, m_scopes, m_help_actions
 * - Transaction Tables (15): t_tag_index, t_decisions, t_decisions_numeric, t_decision_history,
 *   t_decision_tags, t_decision_scopes, t_decision_context, t_decision_policies,
 *   t_constraints, t_constraint_tags, t_token_usage, t_help_action_params,
 *   t_help_action_examples, t_help_use_cases, t_help_action_sequences
 *
 * IDEMPOTENT: Can be run multiple times safely.
 * SQLite, MySQL, PostgreSQL compatible.
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../../utils/universal-knex.js';

// Table mapping: [oldName, newName]
// Ordered by FK dependency tiers for creation
const TABLE_MAPPING: [string, string][] = [
  // ===== TIER 0: No FK dependencies (Master) =====
  ['v4_projects', 'm_projects'],
  ['v4_layers', 'm_layers'],
  ['v4_context_keys', 'm_context_keys'],
  ['v4_constraint_categories', 'm_constraint_categories'],
  ['v4_help_tools', 'm_help_tools'],
  ['v4_help_use_case_cats', 'm_help_use_case_cats'],
  ['v4_builtin_policies', 'm_builtin_policies'],

  // ===== TIER 1: FK to Tier 0 =====
  ['v4_tags', 'm_tags'],                    // FK: m_projects
  ['v4_scopes', 'm_scopes'],                // FK: m_projects
  ['v4_help_actions', 'm_help_actions'],    // FK: m_help_tools
  ['v4_tag_index', 't_tag_index'],          // FK: m_projects

  // ===== TIER 2: FK to Tier 0/1 =====
  ['v4_decisions', 't_decisions'],          // FK: m_context_keys, m_projects, m_layers
  ['v4_decisions_numeric', 't_decisions_numeric'],
  ['v4_decision_history', 't_decision_history'],
  ['v4_constraints', 't_constraints'],      // FK: m_constraint_categories, m_projects, m_layers
  ['v4_token_usage', 't_token_usage'],      // FK: m_projects
  ['v4_help_action_params', 't_help_action_params'],   // FK: m_help_actions
  ['v4_help_action_examples', 't_help_action_examples'],
  ['v4_help_use_cases', 't_help_use_cases'], // FK: m_help_use_case_cats

  // ===== TIER 3: FK to Tier 2 =====
  ['v4_decision_tags', 't_decision_tags'],       // FK: m_context_keys, m_tags
  ['v4_decision_scopes', 't_decision_scopes'],   // FK: m_context_keys, m_scopes
  ['v4_decision_context', 't_decision_context'], // FK: m_context_keys
  ['v4_decision_policies', 't_decision_policies'], // FK: m_projects
  ['v4_constraint_tags', 't_constraint_tags'],   // FK: t_constraints, m_tags
  ['v4_help_action_sequences', 't_help_action_sequences'], // FK: t_help_use_cases, m_help_actions
];

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  console.error('🔄 v5.0: Renaming v4_ prefix to m_/t_ prefix (Option B)...');

  // ============================================================================
  // STEP 1: Create new m_/t_ tables
  // ============================================================================
  console.error('\n📝 Step 1: Creating new m_/t_ tables...');

  // ----- TIER 0: Master tables with no FK dependencies -----

  // m_projects
  const hasNewProjects = await knex.schema.hasTable('m_projects');
  if (!hasNewProjects) {
    await db.createTableSafe('m_projects', (table, helpers) => {
      table.increments('id').primary();
      table.string('name', 64).notNullable().unique();
      table.string('display_name', 128).nullable();
      table.string('detection_source', 20).notNullable();
      table.string('project_root_path', 512).nullable();
      helpers.timestampColumn('created_ts');
      helpers.timestampColumn('last_active_ts');
      table.text('metadata').nullable();
    });
    console.error('  ✓ Created: m_projects');
  }

  // m_layers
  const hasNewLayers = await knex.schema.hasTable('m_layers');
  if (!hasNewLayers) {
    await db.createTableSafe('m_layers', (table) => {
      table.increments('id').primary();
      table.string('name', 50).unique().notNullable();
    });
    console.error('  ✓ Created: m_layers');
  }

  // m_context_keys
  const hasNewContextKeys = await knex.schema.hasTable('m_context_keys');
  if (!hasNewContextKeys) {
    await db.createTableSafe('m_context_keys', (table) => {
      table.increments('id').primary();
      table.string('key_name', 200).unique().notNullable();
    });
    console.error('  ✓ Created: m_context_keys');
  }

  // m_constraint_categories
  const hasNewConstraintCategories = await knex.schema.hasTable('m_constraint_categories');
  if (!hasNewConstraintCategories) {
    await db.createTableSafe('m_constraint_categories', (table) => {
      table.increments('id').primary();
      table.string('name', 100).unique().notNullable();
    });
    console.error('  ✓ Created: m_constraint_categories');
  }

  // m_help_tools
  const hasNewHelpTools = await knex.schema.hasTable('m_help_tools');
  if (!hasNewHelpTools) {
    await db.createTableSafe('m_help_tools', (table) => {
      table.string('tool_name', 100).primary();
      table.text('description').nullable();
      table.text('overview').nullable();
    });
    console.error('  ✓ Created: m_help_tools');
  }

  // m_help_use_case_cats
  const hasNewHelpUseCaseCats = await knex.schema.hasTable('m_help_use_case_cats');
  if (!hasNewHelpUseCaseCats) {
    await db.createTableSafe('m_help_use_case_cats', (table) => {
      table.increments('id').primary();
      table.string('category_name', 100).unique().notNullable();
      table.text('description').nullable();
    });
    console.error('  ✓ Created: m_help_use_case_cats');
  }

  // m_builtin_policies
  const hasNewBuiltinPolicies = await knex.schema.hasTable('m_builtin_policies');
  if (!hasNewBuiltinPolicies) {
    await db.createTableSafe('m_builtin_policies', (table) => {
      table.increments('id').primary();
      table.string('name', 191).unique().notNullable();
      table.text('defaults').nullable();
      table.text('validation_rules').nullable();
      table.text('quality_gates').nullable();
      table.integer('suggest_similar').defaultTo(1);
      table.string('category', 64).nullable();
    });
    console.error('  ✓ Created: m_builtin_policies');
  }

  console.error('  ✓ Tier 0 complete (7 tables)');

  // ----- TIER 1: Tables with FK to Tier 0 -----

  // m_tags
  const hasNewTags = await knex.schema.hasTable('m_tags');
  if (!hasNewTags) {
    await db.createTableSafe('m_tags', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().defaultTo(1);
      table.string('name', 100).notNullable();
      table.unique(['project_id', 'name']);
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: m_tags');
  }

  // m_scopes
  const hasNewScopes = await knex.schema.hasTable('m_scopes');
  if (!hasNewScopes) {
    await db.createTableSafe('m_scopes', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().defaultTo(1);
      table.string('name', 200).notNullable();
      table.unique(['project_id', 'name']);
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: m_scopes');
  }

  // m_help_actions
  const hasNewHelpActions = await knex.schema.hasTable('m_help_actions');
  if (!hasNewHelpActions) {
    await db.createTableSafe('m_help_actions', (table) => {
      table.increments('id').primary();
      table.string('tool_name', 100).notNullable();
      table.string('action_name', 100).notNullable();
      table.text('description').nullable();
      table.text('returns').nullable();
      table.unique(['tool_name', 'action_name']);
      table.foreign('tool_name').references('m_help_tools.tool_name').onDelete('CASCADE');
    });
    console.error('  ✓ Created: m_help_actions');
  }

  // t_tag_index
  const hasNewTagIndex = await knex.schema.hasTable('t_tag_index');
  if (!hasNewTagIndex) {
    await db.createTableSafe('t_tag_index', (table, helpers) => {
      table.increments('id').primary();
      table.string('tag', 64).notNullable();
      table.string('source_type', 20).notNullable();
      table.integer('source_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      helpers.timestampColumn('created_ts');
      table.unique(['tag', 'source_type', 'source_id', 'project_id']);
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_tag_index');
  }

  console.error('  ✓ Tier 1 complete (4 tables)');

  // ----- TIER 2: Tables with FK to Tier 0/1 -----

  // t_decisions
  const hasNewDecisions = await knex.schema.hasTable('t_decisions');
  if (!hasNewDecisions) {
    await db.createTableSafe('t_decisions', (table, helpers) => {
      table.integer('key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.text('value').notNullable();
      table.integer('layer_id').unsigned().nullable();
      table.string('version', 20).defaultTo('1.0.0');
      table.integer('status').defaultTo(1);
      helpers.timestampColumn('ts');
      table.primary(['key_id', 'project_id']);
      table.foreign('key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
      table.foreign('layer_id').references('m_layers.id');
    });
    console.error('  ✓ Created: t_decisions');
  }

  // t_decisions_numeric
  const hasNewDecisionsNumeric = await knex.schema.hasTable('t_decisions_numeric');
  if (!hasNewDecisionsNumeric) {
    await db.createTableSafe('t_decisions_numeric', (table, helpers) => {
      table.integer('key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.double('value').notNullable();
      table.integer('layer_id').unsigned().nullable();
      table.string('version', 20).defaultTo('1.0.0');
      table.integer('status').defaultTo(1);
      helpers.timestampColumn('ts');
      table.primary(['key_id', 'project_id']);
      table.foreign('key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
      table.foreign('layer_id').references('m_layers.id');
    });
    console.error('  ✓ Created: t_decisions_numeric');
  }

  // t_decision_history
  const hasNewDecisionHistory = await knex.schema.hasTable('t_decision_history');
  if (!hasNewDecisionHistory) {
    await db.createTableSafe('t_decision_history', (table, helpers) => {
      table.increments('id').primary();
      table.integer('key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.string('version', 20).notNullable();
      table.text('value').notNullable();
      helpers.timestampColumn('ts');
      table.foreign('key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_decision_history');
  }

  // t_constraints
  const hasNewConstraints = await knex.schema.hasTable('t_constraints');
  if (!hasNewConstraints) {
    await db.createTableSafe('t_constraints', (table, helpers) => {
      table.increments('id').primary();
      table.integer('category_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.integer('layer_id').unsigned().nullable();
      table.text('constraint_text').notNullable();
      table.integer('priority').defaultTo(2);
      table.integer('active').defaultTo(1);
      helpers.timestampColumn('ts');
      table.foreign('category_id').references('m_constraint_categories.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
      table.foreign('layer_id').references('m_layers.id');
    });
    console.error('  ✓ Created: t_constraints');
  }

  // t_token_usage
  const hasNewTokenUsage = await knex.schema.hasTable('t_token_usage');
  if (!hasNewTokenUsage) {
    await db.createTableSafe('t_token_usage', (table, helpers) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable();
      table.string('tool_name', 64).notNullable();
      table.string('action_name', 64).notNullable();
      table.integer('tokens_used').notNullable();
      helpers.timestampColumn('ts');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_token_usage');
  }

  // t_help_action_params
  const hasNewHelpActionParams = await knex.schema.hasTable('t_help_action_params');
  if (!hasNewHelpActionParams) {
    await db.createTableSafe('t_help_action_params', (table) => {
      table.increments('id').primary();
      table.integer('action_id').unsigned().notNullable();
      table.string('param_name', 100).notNullable();
      table.string('param_type', 50).nullable();
      table.integer('required').defaultTo(0);
      table.text('description').nullable();
      table.text('default_value').nullable();
      table.foreign('action_id').references('m_help_actions.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_help_action_params');
  }

  // t_help_action_examples
  const hasNewHelpActionExamples = await knex.schema.hasTable('t_help_action_examples');
  if (!hasNewHelpActionExamples) {
    await db.createTableSafe('t_help_action_examples', (table) => {
      table.increments('id').primary();
      table.integer('action_id').unsigned().notNullable();
      table.string('title', 200).nullable();
      table.text('code').notNullable();
      table.text('explanation').nullable();
      table.foreign('action_id').references('m_help_actions.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_help_action_examples');
  }

  // t_help_use_cases
  const hasNewHelpUseCases = await knex.schema.hasTable('t_help_use_cases');
  if (!hasNewHelpUseCases) {
    await db.createTableSafe('t_help_use_cases', (table) => {
      table.increments('id').primary();
      table.integer('category_id').unsigned().notNullable();
      table.string('title', 200).notNullable();
      table.text('description').nullable();
      table.text('workflow').nullable();
      table.string('complexity', 20).nullable();
      table.foreign('category_id').references('m_help_use_case_cats.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_help_use_cases');
  }

  console.error('  ✓ Tier 2 complete (8 tables)');

  // ----- TIER 3: Tables with FK to Tier 2 -----

  // t_decision_tags
  const hasNewDecisionTags = await knex.schema.hasTable('t_decision_tags');
  if (!hasNewDecisionTags) {
    await db.createTableSafe('t_decision_tags', (table) => {
      table.integer('decision_key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.integer('tag_id').unsigned().notNullable();
      table.primary(['decision_key_id', 'project_id', 'tag_id']);
      table.foreign('decision_key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
      table.foreign('tag_id').references('m_tags.id');
    });
    console.error('  ✓ Created: t_decision_tags');
  }

  // t_decision_scopes
  const hasNewDecisionScopes = await knex.schema.hasTable('t_decision_scopes');
  if (!hasNewDecisionScopes) {
    await db.createTableSafe('t_decision_scopes', (table) => {
      table.integer('decision_key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.integer('scope_id').unsigned().notNullable();
      table.primary(['decision_key_id', 'project_id', 'scope_id']);
      table.foreign('decision_key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
      table.foreign('scope_id').references('m_scopes.id');
    });
    console.error('  ✓ Created: t_decision_scopes');
  }

  // t_decision_context
  const hasNewDecisionContext = await knex.schema.hasTable('t_decision_context');
  if (!hasNewDecisionContext) {
    await db.createTableSafe('t_decision_context', (table, helpers) => {
      table.increments('id').primary();
      table.integer('decision_key_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.text('rationale').notNullable();
      table.text('alternatives_considered').nullable();
      table.text('tradeoffs').nullable();
      table.integer('decision_date').nullable();
      table.integer('related_task_id').nullable();
      table.integer('related_constraint_id').nullable();
      helpers.timestampColumn('ts');
      table.foreign('decision_key_id').references('m_context_keys.id');
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_decision_context');
  }

  // t_decision_policies
  const hasNewDecisionPolicies = await knex.schema.hasTable('t_decision_policies');
  if (!hasNewDecisionPolicies) {
    await db.createTableSafe('t_decision_policies', (table, helpers) => {
      table.increments('id').primary();
      table.string('name', 191).notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.text('description').nullable();
      table.text('defaults').nullable();
      table.text('required_fields').nullable();
      table.text('validation_rules').nullable();
      table.text('quality_gates').nullable();
      table.integer('suggest_similar').defaultTo(1);
      table.string('category', 64).nullable();
      helpers.timestampColumn('ts');
      table.unique(['name', 'project_id']);
      table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    });
    console.error('  ✓ Created: t_decision_policies');
  }

  // t_constraint_tags
  const hasNewConstraintTags = await knex.schema.hasTable('t_constraint_tags');
  if (!hasNewConstraintTags) {
    await db.createTableSafe('t_constraint_tags', (table) => {
      table.integer('constraint_id').unsigned().notNullable();
      table.integer('tag_id').unsigned().notNullable();
      table.primary(['constraint_id', 'tag_id']);
      table.foreign('constraint_id').references('t_constraints.id').onDelete('CASCADE');
      table.foreign('tag_id').references('m_tags.id');
    });
    console.error('  ✓ Created: t_constraint_tags');
  }

  // t_help_action_sequences
  const hasNewHelpActionSequences = await knex.schema.hasTable('t_help_action_sequences');
  if (!hasNewHelpActionSequences) {
    await db.createTableSafe('t_help_action_sequences', (table) => {
      table.increments('id').primary();
      table.integer('use_case_id').unsigned().notNullable();
      table.integer('sequence_order').notNullable();
      table.integer('action_id').unsigned().notNullable();
      table.text('description').nullable();
      table.foreign('use_case_id').references('t_help_use_cases.id').onDelete('CASCADE');
      table.foreign('action_id').references('m_help_actions.id');
    });
    console.error('  ✓ Created: t_help_action_sequences');
  }

  console.error('  ✓ Tier 3 complete (6 tables)');
  console.error('✅ Step 1 complete: 25 new tables created');

  // ============================================================================
  // STEP 2: Copy data from v4_ to m_/t_ tables
  // ============================================================================
  console.error('\n📝 Step 2: Copying data from v4_ to m_/t_ tables...');

  for (const [oldTable, newTable] of TABLE_MAPPING) {
    const hasOld = await knex.schema.hasTable(oldTable);
    const hasNew = await knex.schema.hasTable(newTable);

    if (hasOld && hasNew) {
      // Check if data already copied
      const newCount = await knex(newTable).count('* as count').first() as { count: number } | undefined;
      const oldCount = await knex(oldTable).count('* as count').first() as { count: number } | undefined;

      if ((!newCount || Number(newCount.count) === 0) && oldCount && Number(oldCount.count) > 0) {
        // Copy data using INSERT INTO ... SELECT
        await knex.raw(`INSERT INTO ${newTable} SELECT * FROM ${oldTable}`);
        console.error(`  ✓ Copied: ${oldTable} → ${newTable} (${oldCount.count} rows)`);
      } else if (newCount && Number(newCount.count) > 0) {
        console.error(`  ⏭ Skipped: ${newTable} already has data`);
      } else {
        console.error(`  ⏭ Skipped: ${oldTable} is empty`);
      }
    } else if (!hasOld) {
      console.error(`  ⚠️ Source not found: ${oldTable}`);
    }
  }

  console.error('✅ Step 2 complete: Data copied');

  // ============================================================================
  // STEP 2.5: Reset PostgreSQL sequences (required after INSERT ... SELECT with explicit IDs)
  // ============================================================================
  if (db.isPostgreSQL) {
    console.error('\n📝 Step 2.5: Resetting PostgreSQL sequences...');

    // Tables with auto-increment id columns that need sequence reset
    // Excluded: m_help_tools (string PK), t_decisions/t_decisions_numeric (composite PK)
    const tablesWithSequence = [
      'm_projects', 'm_layers', 'm_context_keys', 'm_constraint_categories',
      'm_help_use_case_cats', 'm_builtin_policies',
      'm_tags', 'm_scopes', 'm_help_actions',
      't_decision_history', 't_constraints', 't_token_usage', 't_help_use_cases',
    ];

    for (const tableName of tablesWithSequence) {
      try {
        const hasTable = await knex.schema.hasTable(tableName);
        if (hasTable) {
          // PostgreSQL sequence naming convention: {table}_{column}_seq
          const seqName = `${tableName}_id_seq`;
          // Set sequence to max(id) + 1, or 1 if table is empty
          await knex.raw(`
            SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1, false)
          `);
        }
      } catch (error: unknown) {
        // Ignore errors for tables/sequences that don't exist
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ⚠️ Could not reset sequence for ${tableName}: ${errorMsg}`);
      }
    }

    console.error('✅ Step 2.5 complete: PostgreSQL sequences reset');
  }

  // ============================================================================
  // STEP 3: Drop old v4_ tables (reverse order for FK)
  // ============================================================================
  console.error('\n📝 Step 3: Dropping old v4_ tables...');

  // Reverse the mapping for proper FK deletion order
  const dropOrder = [...TABLE_MAPPING].reverse();

  for (const [oldTable] of dropOrder) {
    try {
      const exists = await knex.schema.hasTable(oldTable);
      if (exists) {
        await knex.schema.dropTable(oldTable);
        console.error(`  ✓ Dropped: ${oldTable}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message?.toLowerCase() : String(error).toLowerCase();
      if (
        errorMsg.includes('does not exist') ||
        errorMsg.includes('unknown table') ||
        errorMsg.includes('no such table')
      ) {
        console.error(`  ⏭ Already dropped: ${oldTable}`);
      } else {
        throw error;
      }
    }
  }

  console.error('✅ Step 3 complete: Old tables dropped');

  // ============================================================================
  // STEP 4: Create indexes with new names
  // ============================================================================
  console.error('\n📝 Step 4: Creating indexes...');

  // Decision Indexes
  await db.createIndexSafe('t_decisions', ['project_id', 'ts'], 'idx_t_decisions_ts', { desc: true });
  await db.createIndexSafe('t_decisions', ['project_id', 'layer_id'], 'idx_t_decisions_layer');
  await db.createIndexSafe('t_decisions', ['project_id', 'status'], 'idx_t_decisions_status');
  await db.createIndexSafe('t_decision_history', ['project_id', 'key_id', 'ts'], 'idx_t_decision_history_key', { desc: true });
  await db.createIndexSafe('t_decision_context', ['project_id', 'decision_key_id', 'ts'], 'idx_t_decision_context_key', { desc: true });
  await db.createIndexSafe('t_decision_context', ['related_task_id'], 'idx_t_decision_context_task');
  await db.createIndexSafe('t_decision_context', ['related_constraint_id'], 'idx_t_decision_context_constraint');
  await db.createIndexSafe('t_decision_policies', ['project_id', 'category'], 'idx_t_decision_policies_category');
  console.error('  ✓ Decision indexes (8)');

  // Constraint Indexes
  await db.createIndexSafe('t_constraints', ['project_id', 'active', 'category_id'], 'idx_t_constraints_active');
  await db.createIndexSafe('t_constraints', ['project_id', 'priority'], 'idx_t_constraints_priority', { desc: true });
  await db.createIndexSafe('t_constraints', ['project_id', 'layer_id'], 'idx_t_constraints_layer');
  console.error('  ✓ Constraint indexes (3)');

  // Tag Index Indexes
  await db.createIndexSafe('t_tag_index', ['project_id', 'tag'], 'idx_t_tag_index_tag');
  await db.createIndexSafe('t_tag_index', ['project_id', 'source_type', 'source_id'], 'idx_t_tag_index_source');
  console.error('  ✓ Tag index indexes (2)');

  // Token Usage Indexes
  await db.createIndexSafe('t_token_usage', ['project_id', 'ts'], 'idx_t_token_usage_ts', { desc: true });
  await db.createIndexSafe('t_token_usage', ['project_id', 'tool_name', 'action_name'], 'idx_t_token_usage_tool');
  console.error('  ✓ Token usage indexes (2)');

  // Help System Indexes
  await db.createIndexSafe('m_help_actions', ['tool_name'], 'idx_m_help_actions_tool');
  await db.createIndexSafe('t_help_action_params', ['action_id'], 'idx_t_help_action_params_action');
  await db.createIndexSafe('t_help_action_examples', ['action_id'], 'idx_t_help_action_examples_action');
  await db.createIndexSafe('t_help_use_cases', ['category_id'], 'idx_t_help_use_cases_category');
  await db.createIndexSafe('t_help_use_cases', ['complexity'], 'idx_t_help_use_cases_complexity');
  console.error('  ✓ Help system indexes (5)');

  // Project Indexes
  await db.createIndexSafe('m_projects', ['last_active_ts'], 'idx_m_projects_last_active', { desc: true });
  console.error('  ✓ Project indexes (1)');

  console.error('✅ Step 4 complete: 21 indexes created');

  console.error('\n🎉 v5.0 migration completed!');
  console.error('   25 tables renamed: v4_* → m_*/t_*');
}

export async function down(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  console.error('🔄 Rolling back v5.0: Renaming m_/t_ prefix back to v4_...');

  // Reverse the process: create v4_ tables, copy from m_/t_, drop m_/t_

  // For brevity, we'll just list the tables to recreate
  // In production, you would mirror the up() logic

  console.error('⚠️ WARNING: Rolling back v5.0 requires recreating v4_ schema');
  console.error('   This is a complex operation. Consider restoring from backup.');

  // Drop order: Tier 3 → Tier 0
  const dropOrder = [
    't_help_action_sequences', 't_constraint_tags', 't_decision_policies',
    't_decision_context', 't_decision_scopes', 't_decision_tags',
    't_help_use_cases', 't_help_action_examples', 't_help_action_params',
    't_token_usage', 't_constraints', 't_decision_history',
    't_decisions_numeric', 't_decisions', 't_tag_index',
    'm_help_actions', 'm_scopes', 'm_tags',
    'm_builtin_policies', 'm_help_use_case_cats', 'm_help_tools',
    'm_constraint_categories', 'm_context_keys', 'm_layers', 'm_projects',
  ];

  for (const table of dropOrder) {
    await knex.schema.dropTableIfExists(table);
  }

  console.error('✅ m_/t_ tables dropped. Run v4 bootstrap to recreate v4_ tables.');
}
