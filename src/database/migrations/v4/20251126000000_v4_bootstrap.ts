/**
 * Migration: v4.0 Bootstrap (Schema + Indexes + Seed Data)
 *
 * Creates all v4_ prefixed tables, performance indexes, and seeds initial data.
 * This is a complete replacement for the v3.x m_/t_ tables.
 *
 * Key Changes from v3.x:
 * - All tables use v4_ prefix
 * - Removed: m_agents (agent tracking no longer needed after messaging system removal)
 * - Removed: t_agent_messages (unused messaging system)
 * - Removed: t_activity_log (low usage)
 * - Removed: t_decision_templates (merged into v4_decision_policies)
 * - No Views (replaced by application-level queries)
 * - No Triggers (replaced by application-level logic)
 *
 * Tables Created (34 total):
 * - Master Tables (14): v4_files, v4_context_keys, v4_layers,
 *   v4_tags, v4_scopes, v4_config, v4_task_statuses, v4_projects,
 *   v4_constraint_categories, v4_help_tools, v4_help_actions,
 *   v4_help_use_case_cats, v4_tag_index, v4_builtin_policies
 * - Transaction Tables (20): v4_decisions, v4_decisions_numeric,
 *   v4_decision_history, v4_decision_tags, v4_decision_scopes,
 *   v4_decision_context, v4_decision_policies, v4_decision_pruning_log,
 *   v4_file_changes, v4_constraints, v4_constraint_tags,
 *   v4_tasks, v4_task_details, v4_task_tags, v4_task_decision_links,
 *   v4_task_constraint_links, v4_task_file_links, v4_task_dependencies,
 *   v4_task_pruned_files, v4_help_action_params, v4_help_action_examples,
 *   v4_help_use_cases, v4_help_action_sequences, v4_token_usage
 *
 * Indexes Created: 30 performance indexes
 * Seed Data: layers, task_statuses, constraint_categories, default project, tags, config
 */

import type { Knex } from 'knex';
import { UniversalKnex } from '../../../utils/universal-knex.js';

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  console.log('🚀 Starting v4.0 bootstrap migration...');

  // ============================================================================
  // PART 1: CREATE TABLES (35 tables)
  // ============================================================================

  // ---- MASTER TABLES (14 tables) ----
  // Note: v4_agents removed in v4.0 - agent tracking no longer needed after messaging system removal

  // 1. v4_projects - Multi-project support
  await db.createTableSafe('v4_projects', (table, helpers) => {
    table.increments('id').primary();
    table.string('name', 64).notNullable().unique();
    table.string('display_name', 128).nullable();
    table.string('detection_source', 20).notNullable();
    table.string('project_root_path', 512).nullable();
    helpers.timestampColumn('created_ts');
    helpers.timestampColumn('last_active_ts');
    table.text('metadata').nullable();
  });

  // 3. v4_files - File path registry
  // Note: Using string(191) for path in MySQL to stay under utf8mb4 768-byte limit for composite unique
  await db.createTableSafe('v4_files', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.string('path', 512).notNullable();  // path is NOT a primary key, just part of composite unique
    table.unique(['project_id', 'path']);
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 4. v4_context_keys - Decision key registry
  await db.createTableSafe('v4_context_keys', (table) => {
    table.increments('id').primary();
    table.string('key_name', 200).unique().notNullable();
  });

  // 5. v4_layers - Layer definitions (9 layers)
  await db.createTableSafe('v4_layers', (table) => {
    table.increments('id').primary();
    table.string('name', 50).unique().notNullable();
  });

  // 6. v4_tags - Tag definitions
  await db.createTableSafe('v4_tags', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.string('name', 100).notNullable();
    table.unique(['project_id', 'name']);
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 7. v4_scopes - Scope definitions
  await db.createTableSafe('v4_scopes', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.string('name', 200).notNullable();
    table.unique(['project_id', 'name']);
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 8. v4_config - Configuration key-value store
  await db.createTableSafe('v4_config', (table) => {
    table.string('config_key', 191).primary();
    table.text('config_value').notNullable();
  });

  // 9. v4_task_statuses - Task status enum
  await db.createTableSafe('v4_task_statuses', (table) => {
    table.increments('id').primary();
    table.string('name', 50).unique().notNullable();
  });

  // 10. v4_constraint_categories - Constraint types
  await db.createTableSafe('v4_constraint_categories', (table) => {
    table.increments('id').primary();
    table.string('name', 100).unique().notNullable();
  });

  // 11. v4_help_tools - Help system tools
  await db.createTableSafe('v4_help_tools', (table) => {
    table.string('tool_name', 100).primary();
    table.text('description').nullable();
    table.text('overview').nullable();
  });

  // 12. v4_help_actions - Help system actions
  await db.createTableSafe('v4_help_actions', (table) => {
    table.increments('id').primary();
    table.string('tool_name', 100).notNullable();
    table.string('action_name', 100).notNullable();
    table.text('description').nullable();
    table.text('returns').nullable();
    table.unique(['tool_name', 'action_name']);
    table.foreign('tool_name').references('v4_help_tools.tool_name').onDelete('CASCADE');
  });

  // 13. v4_help_use_case_cats - Help use case categories
  await db.createTableSafe('v4_help_use_case_cats', (table) => {
    table.increments('id').primary();
    table.string('category_name', 100).unique().notNullable();
    table.text('description').nullable();
  });

  // 14. v4_tag_index - Tag search optimization
  await db.createTableSafe('v4_tag_index', (table, helpers) => {
    table.increments('id').primary();
    table.string('tag', 64).notNullable();
    table.string('source_type', 20).notNullable();
    table.integer('source_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    helpers.timestampColumn('created_ts');
    table.unique(['tag', 'source_type', 'source_id', 'project_id']);
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 15. v4_builtin_policies - Built-in decision policies
  await db.createTableSafe('v4_builtin_policies', (table) => {
    table.increments('id').primary();
    table.string('name', 191).unique().notNullable();
    table.text('defaults').nullable();
    table.text('validation_rules').nullable();
    table.text('quality_gates').nullable();
    table.integer('suggest_similar').defaultTo(1);
    table.string('category', 64).nullable();
  });

  console.log('✅ Master tables created (14 tables)');

  // ---- TRANSACTION TABLES - Decisions (8 tables) ----

  // 15. v4_decisions - String value decisions
  await db.createTableSafe('v4_decisions', (table, helpers) => {
    table.integer('key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.text('value').notNullable();
    table.integer('layer_id').unsigned().nullable();
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1);
    helpers.timestampColumn('ts');
    table.primary(['key_id', 'project_id']);
    table.foreign('key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('layer_id').references('v4_layers.id');
  });

  // 16. v4_decisions_numeric - Numeric value decisions
  await db.createTableSafe('v4_decisions_numeric', (table, helpers) => {
    table.integer('key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.double('value').notNullable();
    table.integer('layer_id').unsigned().nullable();
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1);
    helpers.timestampColumn('ts');
    table.primary(['key_id', 'project_id']);
    table.foreign('key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('layer_id').references('v4_layers.id');
  });

  // 17. v4_decision_history - Version history
  await db.createTableSafe('v4_decision_history', (table, helpers) => {
    table.increments('id').primary();
    table.integer('key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.string('version', 20).notNullable();
    table.text('value').notNullable();
    helpers.timestampColumn('ts');
    table.foreign('key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 19. v4_decision_tags - Decision-tag many-to-many
  await db.createTableSafe('v4_decision_tags', (table) => {
    table.integer('decision_key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('tag_id').unsigned().notNullable();
    table.primary(['decision_key_id', 'project_id', 'tag_id']);
    table.foreign('decision_key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('tag_id').references('v4_tags.id');
  });

  // 20. v4_decision_scopes - Decision-scope many-to-many
  await db.createTableSafe('v4_decision_scopes', (table) => {
    table.integer('decision_key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('scope_id').unsigned().notNullable();
    table.primary(['decision_key_id', 'project_id', 'scope_id']);
    table.foreign('decision_key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('scope_id').references('v4_scopes.id');
  });

  // 20. v4_decision_context - Rich decision context
  await db.createTableSafe('v4_decision_context', (table, helpers) => {
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
    table.foreign('decision_key_id').references('v4_context_keys.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 22. v4_decision_policies - Decision policies
  await db.createTableSafe('v4_decision_policies', (table, helpers) => {
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
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 23. v4_decision_pruning_log - Pruning audit log
  await db.createTableSafe('v4_decision_pruning_log', (table, helpers) => {
    table.increments('id').primary();
    table.integer('decision_key_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    helpers.timestampColumn('pruned_at');
    table.text('reason').nullable();
  });

  console.log('✅ Decision tables created (8 tables)');

  // ---- TRANSACTION TABLES - Files & Constraints (3 tables) ----

  // 24. v4_file_changes - File change tracking
  await db.createTableSafe('v4_file_changes', (table, helpers) => {
    table.increments('id').primary();
    table.integer('file_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('layer_id').unsigned().nullable();
    table.integer('change_type').notNullable();
    table.text('description').nullable();
    helpers.timestampColumn('ts');
    table.foreign('file_id').references('v4_files.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('layer_id').references('v4_layers.id');
  });

  // 25. v4_constraints - Architectural constraints
  await db.createTableSafe('v4_constraints', (table, helpers) => {
    table.increments('id').primary();
    table.integer('category_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('layer_id').unsigned().nullable();
    table.text('constraint_text').notNullable();
    table.integer('priority').defaultTo(2);
    table.integer('active').defaultTo(1);
    helpers.timestampColumn('ts');
    table.foreign('category_id').references('v4_constraint_categories.id');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('layer_id').references('v4_layers.id');
  });

  // 26. v4_constraint_tags - Constraint-tag many-to-many
  await db.createTableSafe('v4_constraint_tags', (table) => {
    table.integer('constraint_id').unsigned().notNullable();
    table.integer('tag_id').unsigned().notNullable();
    table.primary(['constraint_id', 'tag_id']);
    table.foreign('constraint_id').references('v4_constraints.id').onDelete('CASCADE');
    table.foreign('tag_id').references('v4_tags.id');
  });

  console.log('✅ File & Constraint tables created (3 tables)');

  // ---- TRANSACTION TABLES - Tasks (8 tables) ----

  // 27. v4_tasks - Task core data
  await db.createTableSafe('v4_tasks', (table, helpers) => {
    table.increments('id').primary();
    table.string('title', 500).notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('status_id').unsigned().defaultTo(1);
    table.integer('priority').defaultTo(2);
    table.integer('layer_id').unsigned().nullable();
    helpers.timestampColumn('created_ts');
    helpers.timestampColumn('updated_ts');
    table.integer('completed_ts').nullable();
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('status_id').references('v4_task_statuses.id');
    table.foreign('layer_id').references('v4_layers.id');
  });

  // 28. v4_task_details - Task descriptions (large text)
  await db.createTableSafe('v4_task_details', (table) => {
    table.integer('task_id').unsigned().primary();
    table.text('description').nullable();
    table.text('acceptance_criteria').nullable();
    table.text('acceptance_criteria_json').nullable();
    table.text('notes').nullable();
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
  });

  // 29. v4_task_tags - Task-tag many-to-many
  await db.createTableSafe('v4_task_tags', (table) => {
    table.integer('task_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('tag_id').unsigned().notNullable();
    table.primary(['task_id', 'project_id', 'tag_id']);
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('tag_id').references('v4_tags.id');
  });

  // 30. v4_task_decision_links - Task-decision links
  await db.createTableSafe('v4_task_decision_links', (table) => {
    table.integer('task_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('decision_key_id').unsigned().notNullable();
    table.string('link_type', 32).defaultTo('implements');
    table.primary(['task_id', 'project_id', 'decision_key_id']);
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('decision_key_id').references('v4_context_keys.id');
  });

  // 31. v4_task_constraint_links - Task-constraint links
  await db.createTableSafe('v4_task_constraint_links', (table) => {
    table.integer('task_id').unsigned().notNullable();
    table.integer('constraint_id').unsigned().notNullable();
    table.primary(['task_id', 'constraint_id']);
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('constraint_id').references('v4_constraints.id').onDelete('CASCADE');
  });

  // 32. v4_task_file_links - Task-file links
  await db.createTableSafe('v4_task_file_links', (table, helpers) => {
    table.integer('task_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.integer('file_id').unsigned().notNullable();
    table.string('action', 10).defaultTo('edit');
    helpers.timestampColumn('linked_ts');
    table.primary(['task_id', 'project_id', 'file_id']);
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
    table.foreign('file_id').references('v4_files.id');
  });

  // 33. v4_task_dependencies - Task blocking relationships
  await db.createTableSafe('v4_task_dependencies', (table, helpers) => {
    table.integer('blocker_task_id').unsigned().notNullable();
    table.integer('blocked_task_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    helpers.timestampColumn('created_ts');
    table.primary(['blocker_task_id', 'blocked_task_id', 'project_id']);
    table.foreign('blocker_task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('blocked_task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  // 34. v4_task_pruned_files - Pruned file records
  await db.createTableSafe('v4_task_pruned_files', (table, helpers) => {
    table.increments('id').primary();
    table.integer('task_id').unsigned().notNullable();
    table.integer('project_id').unsigned().notNullable();
    table.string('file_path', 512).notNullable();
    table.string('action', 10).defaultTo('edit');
    helpers.timestampColumn('pruned_ts');
    table.text('reason').nullable();
    table.integer('linked_decision_id').unsigned().nullable();
    table.foreign('task_id').references('v4_tasks.id').onDelete('CASCADE');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  console.log('✅ Task tables created (8 tables)');

  // ---- TRANSACTION TABLES - Help System (4 tables) ----

  // 35. v4_help_action_params - Action parameters
  await db.createTableSafe('v4_help_action_params', (table) => {
    table.increments('id').primary();
    table.integer('action_id').unsigned().notNullable();
    table.string('param_name', 100).notNullable();
    table.string('param_type', 50).nullable();
    table.integer('required').defaultTo(0);
    table.text('description').nullable();
    table.text('default_value').nullable();
    table.foreign('action_id').references('v4_help_actions.id').onDelete('CASCADE');
  });

  // 36. v4_help_action_examples - Action examples
  await db.createTableSafe('v4_help_action_examples', (table) => {
    table.increments('id').primary();
    table.integer('action_id').unsigned().notNullable();
    table.string('title', 200).nullable();
    table.text('code').notNullable();
    table.text('explanation').nullable();
    table.foreign('action_id').references('v4_help_actions.id').onDelete('CASCADE');
  });

  // 37. v4_help_use_cases - Use case definitions
  await db.createTableSafe('v4_help_use_cases', (table) => {
    table.increments('id').primary();
    table.integer('category_id').unsigned().notNullable();
    table.string('title', 200).notNullable();
    table.text('description').nullable();
    table.text('workflow').nullable();
    table.string('complexity', 20).nullable();
    table.foreign('category_id').references('v4_help_use_case_cats.id').onDelete('CASCADE');
  });

  // 38. v4_help_action_sequences - Action sequences
  await db.createTableSafe('v4_help_action_sequences', (table) => {
    table.increments('id').primary();
    table.integer('use_case_id').unsigned().notNullable();
    table.integer('sequence_order').notNullable();
    table.integer('action_id').unsigned().notNullable();
    table.text('description').nullable();
    table.foreign('use_case_id').references('v4_help_use_cases.id').onDelete('CASCADE');
    table.foreign('action_id').references('v4_help_actions.id');
  });

  console.log('✅ Help system tables created (4 tables)');

  // ---- TRANSACTION TABLES - Utility (1 table) ----

  // 39. v4_token_usage - Token tracking
  await db.createTableSafe('v4_token_usage', (table, helpers) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable();
    table.string('tool_name', 64).notNullable();
    table.string('action_name', 64).notNullable();
    table.integer('tokens_used').notNullable();
    helpers.timestampColumn('ts');
    table.foreign('project_id').references('v4_projects.id').onDelete('CASCADE');
  });

  console.log('✅ Utility tables created (1 table)');
  console.log('🎉 Schema creation completed! (34 tables total)');

  // ============================================================================
  // PART 2: CREATE INDEXES (30 indexes)
  // ============================================================================

  console.log('📇 Creating performance indexes...');

  // Decision Indexes (8)
  await db.createIndexSafe('v4_decisions', ['project_id', 'ts'], 'idx_v4_decisions_ts', { desc: true });
  await db.createIndexSafe('v4_decisions', ['project_id', 'layer_id'], 'idx_v4_decisions_layer');
  await db.createIndexSafe('v4_decisions', ['project_id', 'status'], 'idx_v4_decisions_status');
  await db.createIndexSafe('v4_decision_history', ['project_id', 'key_id', 'ts'], 'idx_v4_decision_history_key', { desc: true });
  await db.createIndexSafe('v4_decision_context', ['project_id', 'decision_key_id', 'ts'], 'idx_v4_decision_context_key', { desc: true });
  await db.createIndexSafe('v4_decision_context', ['related_task_id'], 'idx_v4_decision_context_task');
  await db.createIndexSafe('v4_decision_context', ['related_constraint_id'], 'idx_v4_decision_context_constraint');
  await db.createIndexSafe('v4_decision_policies', ['project_id', 'category'], 'idx_v4_decision_policies_category');
  console.log('  ✓ Decision indexes (8)');

  // Task Indexes (7)
  await db.createIndexSafe('v4_tasks', ['project_id', 'status_id'], 'idx_v4_tasks_status');
  await db.createIndexSafe('v4_tasks', ['project_id', 'updated_ts'], 'idx_v4_tasks_updated', { desc: true });
  await db.createIndexSafe('v4_tasks', ['project_id', 'created_ts'], 'idx_v4_tasks_created', { desc: true });
  await db.createIndexSafe('v4_tasks', ['project_id', 'layer_id'], 'idx_v4_tasks_layer');
  await db.createIndexSafe('v4_tasks', ['project_id', 'priority'], 'idx_v4_tasks_priority', { desc: true });
  await db.createIndexSafe('v4_task_dependencies', ['project_id', 'blocked_task_id'], 'idx_v4_task_deps_blocked');
  await db.createIndexSafe('v4_task_dependencies', ['project_id', 'blocker_task_id'], 'idx_v4_task_deps_blocker');
  console.log('  ✓ Task indexes (7)');

  // File Change Indexes (3)
  await db.createIndexSafe('v4_file_changes', ['project_id', 'ts'], 'idx_v4_file_changes_ts', { desc: true });
  await db.createIndexSafe('v4_file_changes', ['project_id', 'file_id'], 'idx_v4_file_changes_file');
  await db.createIndexSafe('v4_file_changes', ['project_id', 'layer_id'], 'idx_v4_file_changes_layer');
  console.log('  ✓ File change indexes (3)');

  // Constraint Indexes (3)
  await db.createIndexSafe('v4_constraints', ['project_id', 'active', 'category_id'], 'idx_v4_constraints_active');
  await db.createIndexSafe('v4_constraints', ['project_id', 'priority'], 'idx_v4_constraints_priority', { desc: true });
  await db.createIndexSafe('v4_constraints', ['project_id', 'layer_id'], 'idx_v4_constraints_layer');
  console.log('  ✓ Constraint indexes (3)');

  // Tag Index Indexes (2)
  await db.createIndexSafe('v4_tag_index', ['project_id', 'tag'], 'idx_v4_tag_index_tag');
  await db.createIndexSafe('v4_tag_index', ['project_id', 'source_type', 'source_id'], 'idx_v4_tag_index_source');
  console.log('  ✓ Tag index indexes (2)');

  // Token Usage Indexes (2)
  await db.createIndexSafe('v4_token_usage', ['project_id', 'ts'], 'idx_v4_token_usage_ts', { desc: true });
  await db.createIndexSafe('v4_token_usage', ['project_id', 'tool_name', 'action_name'], 'idx_v4_token_usage_tool');
  console.log('  ✓ Token usage indexes (2)');

  // Help System Indexes (5)
  await db.createIndexSafe('v4_help_actions', ['tool_name'], 'idx_v4_help_actions_tool');
  await db.createIndexSafe('v4_help_action_params', ['action_id'], 'idx_v4_help_action_params_action');
  await db.createIndexSafe('v4_help_action_examples', ['action_id'], 'idx_v4_help_action_examples_action');
  await db.createIndexSafe('v4_help_use_cases', ['category_id'], 'idx_v4_help_use_cases_category');
  await db.createIndexSafe('v4_help_use_cases', ['complexity'], 'idx_v4_help_use_cases_complexity');
  console.log('  ✓ Help system indexes (5)');

  // Project Indexes (1)
  await db.createIndexSafe('v4_projects', ['last_active_ts'], 'idx_v4_projects_last_active', { desc: true });
  console.log('  ✓ Project indexes (1)');

  console.log('🎉 Index creation completed! (30 indexes total)');

  // ============================================================================
  // PART 3: SEED MASTER DATA
  // ============================================================================

  console.log('🌱 Seeding master data...');

  const insertIgnore = db.isPostgreSQL ? '' : db.isMySQL ? 'IGNORE' : 'OR IGNORE';

  // 1. Seed v4_layers (9 layers)
  const existingLayers = await knex('v4_layers').count('* as count').first();
  if (!existingLayers || Number(existingLayers.count) === 0) {
    if (db.isPostgreSQL) {
      await knex.raw(`
        INSERT INTO v4_layers (id, name) VALUES
          (1, 'presentation'), (2, 'business'), (3, 'data'), (4, 'infrastructure'),
          (5, 'cross-cutting'), (6, 'documentation'), (7, 'planning'), (8, 'coordination'), (9, 'review')
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      await knex.raw(`
        INSERT ${insertIgnore} INTO v4_layers (id, name) VALUES
          (1, 'presentation'), (2, 'business'), (3, 'data'), (4, 'infrastructure'),
          (5, 'cross-cutting'), (6, 'documentation'), (7, 'planning'), (8, 'coordination'), (9, 'review')
      `);
    }
    console.log('  ✓ Layers seeded (9)');
  }

  // 2. Seed v4_constraint_categories
  const existingCategories = await knex('v4_constraint_categories').count('* as count').first();
  if (!existingCategories || Number(existingCategories.count) === 0) {
    if (db.isPostgreSQL) {
      await knex.raw(`
        INSERT INTO v4_constraint_categories (name) VALUES
          ('architecture'), ('security'), ('performance'), ('compatibility'), ('maintainability')
        ON CONFLICT (name) DO NOTHING
      `);
    } else {
      await knex.raw(`
        INSERT ${insertIgnore} INTO v4_constraint_categories (name) VALUES
          ('architecture'), ('security'), ('performance'), ('compatibility'), ('maintainability')
      `);
    }
    console.log('  ✓ Constraint categories seeded (5)');
  }

  // 3. Seed v4_task_statuses
  const existingStatuses = await knex('v4_task_statuses').count('* as count').first();
  if (!existingStatuses || Number(existingStatuses.count) === 0) {
    if (db.isPostgreSQL) {
      await knex.raw(`
        INSERT INTO v4_task_statuses (id, name) VALUES
          (1, 'todo'), (2, 'in_progress'), (3, 'waiting_review'), (4, 'blocked'), (5, 'done'), (6, 'archived')
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      await knex.raw(`
        INSERT ${insertIgnore} INTO v4_task_statuses (id, name) VALUES
          (1, 'todo'), (2, 'in_progress'), (3, 'waiting_review'), (4, 'blocked'), (5, 'done'), (6, 'archived')
      `);
    }
    console.log('  ✓ Task statuses seeded (6)');
  }

  // 4. Seed v4_projects (default project)
  const existingProjects = await knex('v4_projects').count('* as count').first();
  if (!existingProjects || Number(existingProjects.count) === 0) {
    const now = Math.floor(Date.now() / 1000);
    await knex('v4_projects').insert({
      id: 1,
      name: 'default',
      display_name: 'Default Project',
      detection_source: 'migration',
      created_ts: now,
      last_active_ts: now,
    });
    console.log('  ✓ Default project created');
  }

  // 5. Seed v4_tags (common development tags)
  const existingTags = await knex('v4_tags').count('* as count').first();
  if (!existingTags || Number(existingTags.count) === 0) {
    if (db.isPostgreSQL) {
      await knex.raw(`
        INSERT INTO v4_tags (project_id, name) VALUES
          (1, 'authentication'), (1, 'authorization'), (1, 'validation'), (1, 'error-handling'),
          (1, 'logging'), (1, 'performance'), (1, 'security'), (1, 'testing')
        ON CONFLICT (project_id, name) DO NOTHING
      `);
    } else {
      await knex.raw(`
        INSERT ${insertIgnore} INTO v4_tags (project_id, name) VALUES
          (1, 'authentication'), (1, 'authorization'), (1, 'validation'), (1, 'error-handling'),
          (1, 'logging'), (1, 'performance'), (1, 'security'), (1, 'testing')
      `);
    }
    console.log('  ✓ Common tags seeded (8)');
  }

  // 6. Seed v4_config (default configuration)
  const existingConfig = await knex('v4_config').count('* as count').first();
  if (!existingConfig || Number(existingConfig.count) === 0) {
    if (db.isPostgreSQL) {
      await knex.raw(`
        INSERT INTO v4_config (config_key, config_value) VALUES
          ('autodelete_ignore_weekend', '1'), ('autodelete_message_hours', '24'),
          ('autodelete_file_history_days', '7'), ('schema_version', '4.0.0')
        ON CONFLICT (config_key) DO NOTHING
      `);
    } else {
      await knex.raw(`
        INSERT ${insertIgnore} INTO v4_config (config_key, config_value) VALUES
          ('autodelete_ignore_weekend', '1'), ('autodelete_message_hours', '24'),
          ('autodelete_file_history_days', '7'), ('schema_version', '4.0.0')
      `);
    }
    console.log('  ✓ Configuration seeded (4)');
  }

  console.log('🎉 v4.0 bootstrap migration completed!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back v4.0 bootstrap...');

  // Drop in reverse order to handle foreign key constraints
  const tables = [
    'v4_token_usage',
    'v4_help_action_sequences', 'v4_help_use_cases', 'v4_help_action_examples', 'v4_help_action_params',
    'v4_task_pruned_files', 'v4_task_dependencies', 'v4_task_file_links', 'v4_task_constraint_links',
    'v4_task_decision_links', 'v4_task_tags', 'v4_task_details', 'v4_tasks',
    'v4_constraint_tags', 'v4_constraints', 'v4_file_changes',
    'v4_decision_pruning_log', 'v4_decision_policies', 'v4_decision_context', 'v4_decision_scopes',
    'v4_decision_tags', 'v4_decision_history', 'v4_decisions_numeric', 'v4_decisions',
    'v4_builtin_policies', 'v4_tag_index', 'v4_help_use_case_cats', 'v4_help_actions', 'v4_help_tools',
    'v4_constraint_categories', 'v4_task_statuses', 'v4_config', 'v4_scopes', 'v4_tags', 'v4_layers',
    'v4_context_keys', 'v4_files', 'v4_projects',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  console.log('✅ v4.0 bootstrap rolled back successfully');
}
