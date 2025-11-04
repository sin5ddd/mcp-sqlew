import type { Knex } from "knex";

/**
 * Migration: Add Help System Tables (v3.5.3 -> v3.6.0)
 *
 * Creates database tables for the help system optimization to reduce token consumption
 * by moving help documentation from code to queryable database structures.
 *
 * Tables Created:
 * - m_help_tools: Master table for tool names
 * - m_help_actions: Master table for action names per tool
 * - t_help_action_params: Parameters for each action
 * - t_help_action_examples: Examples for each action
 * - m_help_use_case_categories: Use case taxonomy
 * - t_help_use_cases: Full use case documentation
 * - t_help_action_sequences: Common action patterns with usage tracking
 */

export async function up(knex: Knex): Promise<void> {
  // Check if help system tables already exist
  const hasHelpTools = await knex.schema.hasTable('m_help_tools');

  if (hasHelpTools) {
    console.log('✓ Help system tables already exist, skipping creation');
    return;
  }

  // 1. Create m_help_tools (Master table for tool names)
  await knex.schema.createTable('m_help_tools', (table) => {
    table.string('tool_name', 100).primary();
    table.text('description').notNullable();
  });

  // 2. Create m_help_actions (Master table for action names per tool)
  await knex.schema.createTable('m_help_actions', (table) => {
    table.increments('action_id').primary();
    table.string('tool_name', 100).notNullable();
    table.string('action_name', 100).notNullable();
    table.text('description').notNullable();

    // Foreign key
    table.foreign('tool_name')
      .references('tool_name')
      .inTable('m_help_tools')
      .onDelete('CASCADE');

    // Unique constraint
    table.unique(['tool_name', 'action_name']);

    // Index for fast lookups
    table.index('tool_name', 'idx_help_actions_tool');
  });

  // 3. Create t_help_action_params (Parameters for each action)
  await knex.schema.createTable('t_help_action_params', (table) => {
    table.increments('param_id').primary();
    table.integer('action_id').unsigned().notNullable();
    table.string('param_name', 100).notNullable();
    table.string('param_type', 50).notNullable();
    table.integer('required').notNullable().defaultTo(0);
    table.text('description').notNullable();
    table.text('default_value').nullable();

    // Foreign key
    table.foreign('action_id')
      .references('action_id')
      .inTable('m_help_actions')
      .onDelete('CASCADE');

    // Index for fast parameter lookups
    table.index('action_id', 'idx_help_action_params_action');
  });

  // 4. Create t_help_action_examples (Examples for each action)
  await knex.schema.createTable('t_help_action_examples', (table) => {
    table.increments('example_id').primary();
    table.integer('action_id').unsigned().notNullable();
    table.string('example_title', 200).notNullable();
    table.text('example_code').notNullable();
    table.text('explanation').notNullable();

    // Foreign key
    table.foreign('action_id')
      .references('action_id')
      .inTable('m_help_actions')
      .onDelete('CASCADE');

    // Index for fast example lookups
    table.index('action_id', 'idx_help_action_examples_action');
  });

  // 5. Create m_help_use_case_categories (Use case taxonomy)
  await knex.schema.createTable('m_help_use_case_categories', (table) => {
    table.increments('category_id').primary();
    table.string('category_name', 100).unique().notNullable();
    table.text('description').notNullable();
  });

  // 6. Create t_help_use_cases (Full use case documentation)
  await knex.schema.createTable('t_help_use_cases', (table) => {
    table.increments('use_case_id').primary();
    table.integer('category_id').unsigned().notNullable();
    table.string('title', 200).notNullable();
    table.enu('complexity', ['basic', 'intermediate', 'advanced']).notNullable();
    table.text('description').notNullable();
    table.text('full_example').notNullable();
    table.text('action_sequence').notNullable();

    // Foreign key
    table.foreign('category_id')
      .references('category_id')
      .inTable('m_help_use_case_categories')
      .onDelete('CASCADE');

    // Indexes for fast use case lookups
    table.index('category_id', 'idx_help_use_cases_category');
    table.index('complexity', 'idx_help_use_cases_complexity');
  });

  // 7. Create t_help_action_sequences (Common action patterns with usage tracking)
  await knex.schema.createTable('t_help_action_sequences', (table) => {
    table.increments('sequence_id').primary();
    table.string('sequence_name', 200).notNullable();
    table.text('actions').notNullable();
    table.text('description').notNullable();
    table.integer('use_count').notNullable().defaultTo(0);

    // Index for fast sequence lookups by use_count (most popular first)
    table.index('use_count', 'idx_help_action_sequences_use_count');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to respect foreign key constraints
  await knex.schema.dropTableIfExists('t_help_action_sequences');
  await knex.schema.dropTableIfExists('t_help_use_cases');
  await knex.schema.dropTableIfExists('m_help_use_case_categories');
  await knex.schema.dropTableIfExists('t_help_action_examples');
  await knex.schema.dropTableIfExists('t_help_action_params');
  await knex.schema.dropTableIfExists('m_help_actions');
  await knex.schema.dropTableIfExists('m_help_tools');
}
