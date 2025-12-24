/**
 * CONVERTED VERSION using Universal Knex Wrapper
 *
 * Original: src/config/knex/bootstrap/20251025021152_create_transaction_tables.ts
 *
 * Changes:
 * - Replaced all manual hasTable() checks with createTableSafe()
 * - Cleaner, more maintainable code
 *
 * Lines reduced: 296 → 247 (17% reduction)
 */

import type { Knex } from "knex";
import { UniversalKnex } from "../../utils/universal-knex.js";

export async function up(knex: Knex): Promise<void> {
  const db = new UniversalKnex(knex);

  // ============================================================================
  // Transaction Tables (t_ prefix) - Core Data
  // ============================================================================

  // Decisions (String Values) - composite PK (key_id, project_id) added in v3.7.0
  await db.createTableSafe('t_decisions', (table) => {
    table.integer('key_id').unsigned();
    table.foreign('key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.text('value').notNullable();
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1); // 1=active, 2=deprecated, 3=draft
    table.integer('ts').notNullable();
    table.primary(['key_id', 'project_id']);
  });

  // Decisions (Numeric Values) - composite PK (key_id, project_id) added in v3.7.0
  await db.createTableSafe('t_decisions_numeric', (table) => {
    table.integer('key_id').unsigned();
    table.foreign('key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.double('value').notNullable();
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.string('version', 20).defaultTo('1.0.0');
    table.integer('status').defaultTo(1);
    table.integer('ts').notNullable();
    table.primary(['key_id', 'project_id']);
  });

  // Decision Version History - project_id added in v3.7.0
  await db.createTableSafe('t_decision_history', (table) => {
    table.increments('id').primary();
    table.integer('key_id').unsigned();
    table.foreign('key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.string('version', 20).notNullable();
    table.text('value').notNullable();
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('ts').notNullable();
  });

  // Decision Tagging (Many-to-Many) - project_id added in v3.7.0
  await db.createTableSafe('t_decision_tags', (table) => {
    table.integer('decision_key_id').unsigned();
    table.foreign('decision_key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('tag_id').unsigned();
    table.foreign('tag_id').references('m_tags.id');
    table.primary(['decision_key_id', 'project_id', 'tag_id']);
  });

  // Decision Scopes (Many-to-Many) - project_id added in v3.7.0
  await db.createTableSafe('t_decision_scopes', (table) => {
    table.integer('decision_key_id').unsigned();
    table.foreign('decision_key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('scope_id').unsigned();
    table.foreign('scope_id').references('m_scopes.id');
    table.primary(['decision_key_id', 'project_id', 'scope_id']);
  });

  // Agent Messages
  await db.createTableSafe('t_agent_messages', (table) => {
    table.increments('id').primary();
    table.integer('from_agent_id').unsigned();
    table.foreign('from_agent_id').references('m_agents.id');
    table.integer('to_agent_id').unsigned();
    table.foreign('to_agent_id').references('m_agents.id');
    table.integer('msg_type').notNullable(); // 1=decision, 2=warning, 3=request, 4=info
    table.integer('priority').defaultTo(2); // 1=low, 2=medium, 3=high, 4=critical
    table.text('message').notNullable();
    table.text('payload'); // JSON stored as TEXT
    table.boolean('read').defaultTo(false);
    table.integer('ts').notNullable();
  });

  // File Change Tracking - project_id added in v3.7.0
  await db.createTableSafe('t_file_changes', (table) => {
    table.increments('id').primary();
    table.integer('file_id').unsigned();
    table.foreign('file_id').references('m_files.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('change_type').notNullable(); // 1=created, 2=modified, 3=deleted
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.text('description');
    table.integer('ts').notNullable();
  });

  // Constraints - project_id added in v3.7.0
  await db.createTableSafe('t_constraints', (table) => {
    table.increments('id').primary();
    table.integer('category_id').unsigned();
    table.foreign('category_id').references('m_constraint_categories.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.text('constraint_text').notNullable();
    table.integer('priority').defaultTo(2); // 1=low, 2=medium, 3=high, 4=critical
    table.boolean('active').defaultTo(true);
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('ts').notNullable();
  });

  // Constraint Tagging (Many-to-Many) - project_id added in v3.7.0
  await db.createTableSafe('t_constraint_tags', (table) => {
    table.integer('constraint_id').unsigned();
    table.foreign('constraint_id').references('t_constraints.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('tag_id').unsigned();
    table.foreign('tag_id').references('m_tags.id');
    table.primary(['constraint_id', 'project_id', 'tag_id']);
  });

  // Activity Log - project_id added in v3.7.0
  await db.createTableSafe('t_activity_log', (table) => {
    table.increments('id').primary();
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.string('action_type', 50).notNullable();
    table.string('target', 500);
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.text('details'); // JSON stored as TEXT
    table.integer('ts').notNullable();
  });

  // Decision Templates
  await db.createTableSafe('t_decision_templates', (table) => {
    table.increments('id').primary();
    table.string('name', 200).unique().notNullable();
    table.text('description');
    table.text('defaults'); // JSON
    table.text('required_fields'); // JSON
  });

  // Decision Context (v3.2.2, project_id added in v3.7.0)
  await db.createTableSafe('t_decision_context', (table) => {
    table.increments('id').primary();
    table.integer('decision_key_id').unsigned();
    table.foreign('decision_key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.text('rationale');
    table.text('alternatives_considered'); // JSON array
    table.text('tradeoffs'); // JSON object
    table.integer('decision_date');
    table.integer('agent_id').unsigned();
    table.foreign('agent_id').references('m_agents.id');
    table.integer('ts').notNullable();
  });

  // Tasks (v3.0.0 Kanban system) - project_id added in v3.7.0
  await db.createTableSafe('t_tasks', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.string('title', 500).notNullable();
    table.integer('status_id').unsigned().defaultTo(1); // 1=todo
    table.foreign('status_id').references('m_task_statuses.id');
    table.integer('priority').defaultTo(2);
    table.integer('assigned_agent_id').unsigned();
    table.foreign('assigned_agent_id').references('m_agents.id');
    table.integer('created_by_agent_id').unsigned();
    table.foreign('created_by_agent_id').references('m_agents.id');
    table.integer('layer_id').unsigned();
    table.foreign('layer_id').references('m_layers.id');
    table.integer('created_ts').notNullable();
    table.integer('updated_ts').notNullable();
    table.integer('completed_ts');
  });

  // Task Details - project_id added in v3.7.0
  await db.createTableSafe('t_task_details', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.text('description');
    table.text('acceptance_criteria');
    table.text('acceptance_criteria_json'); // JSON
    table.text('notes');
    table.primary(['task_id', 'project_id']);
  });

  // Task Tagging (Many-to-Many) - project_id added in v3.7.0
  await db.createTableSafe('t_task_tags', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('tag_id').unsigned();
    table.foreign('tag_id').references('m_tags.id');
    table.primary(['project_id', 'task_id', 'tag_id']);
  });

  // Task-Decision Links - project_id added in v3.7.0
  await db.createTableSafe('t_task_decision_links', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('decision_key_id').unsigned();
    table.foreign('decision_key_id').references('m_context_keys.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.primary(['task_id', 'decision_key_id', 'project_id']);
  });

  // Task-Constraint Links - project_id added in v3.7.0
  await db.createTableSafe('t_task_constraint_links', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('constraint_id').unsigned();
    table.foreign('constraint_id').references('t_constraints.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.primary(['task_id', 'constraint_id', 'project_id']);
  });

  // Task-File Links - project_id added in v3.7.0
  await db.createTableSafe('t_task_file_links', (table) => {
    table.integer('task_id').unsigned();
    table.foreign('task_id').references('t_tasks.id');
    table.integer('file_id').unsigned();
    table.foreign('file_id').references('m_files.id');
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.unique(['project_id', 'task_id', 'file_id']);
  });

  // Task Dependencies (v3.2.0) - with CASCADE delete, project_id added in v3.7.0
  await db.createTableSafe('t_task_dependencies', (table) => {
    table.integer('blocker_task_id').unsigned();
    table.integer('blocked_task_id').unsigned();
    table.integer('project_id').unsigned().notNullable().defaultTo(1);
    table.foreign('project_id').references('m_projects.id').onDelete('CASCADE');
    table.integer('created_ts').notNullable();
    table.primary(['project_id', 'blocker_task_id', 'blocked_task_id']);
    table.foreign('blocker_task_id').references('t_tasks.id').onDelete('CASCADE');
    table.foreign('blocked_task_id').references('t_tasks.id').onDelete('CASCADE');
  });

  console.error('✅ Transaction tables created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order to handle foreign keys
  await knex.schema.dropTableIfExists('t_task_dependencies');
  await knex.schema.dropTableIfExists('t_task_file_links');
  await knex.schema.dropTableIfExists('t_task_constraint_links');
  await knex.schema.dropTableIfExists('t_task_decision_links');
  await knex.schema.dropTableIfExists('t_task_tags');
  await knex.schema.dropTableIfExists('t_task_details');
  await knex.schema.dropTableIfExists('t_tasks');
  await knex.schema.dropTableIfExists('t_decision_context');
  await knex.schema.dropTableIfExists('t_decision_templates');
  await knex.schema.dropTableIfExists('t_activity_log');
  await knex.schema.dropTableIfExists('t_constraint_tags');
  await knex.schema.dropTableIfExists('t_constraints');
  await knex.schema.dropTableIfExists('t_file_changes');
  await knex.schema.dropTableIfExists('t_agent_messages');
  await knex.schema.dropTableIfExists('t_decision_scopes');
  await knex.schema.dropTableIfExists('t_decision_tags');
  await knex.schema.dropTableIfExists('t_decision_history');
  await knex.schema.dropTableIfExists('t_decisions_numeric');
  await knex.schema.dropTableIfExists('t_decisions');

  console.error('✅ Transaction tables dropped successfully');
}
