import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Master Tables (m_ prefix) - Normalization Layer
  // ============================================================================

  // Agent Management
  if (!(await knex.schema.hasTable('m_agents'))) {
    await knex.schema.createTable('m_agents', (table) => {
      table.increments('id').primary();
      table.string('name', 100).unique().notNullable();
    });
  }

  // File Path Management
  if (!(await knex.schema.hasTable('m_files'))) {
    await knex.schema.createTable('m_files', (table) => {
      table.increments('id').primary();
      table.string('path', 1000).unique().notNullable();
    });
  }

  // Context Key Management
  if (!(await knex.schema.hasTable('m_context_keys'))) {
    await knex.schema.createTable('m_context_keys', (table) => {
      table.increments('id').primary();
      table.string('key', 200).unique().notNullable();
    });
  }

  // Constraint Category Management
  if (!(await knex.schema.hasTable('m_constraint_categories'))) {
    await knex.schema.createTable('m_constraint_categories', (table) => {
      table.increments('id').primary();
      table.string('name', 100).unique().notNullable();
    });
  }

  // Layer Management (5 predefined layers)
  if (!(await knex.schema.hasTable('m_layers'))) {
    await knex.schema.createTable('m_layers', (table) => {
      table.increments('id').primary();
      table.string('name', 50).unique().notNullable();
    });
  }

  // Tag Management
  if (!(await knex.schema.hasTable('m_tags'))) {
    await knex.schema.createTable('m_tags', (table) => {
      table.increments('id').primary();
      table.string('name', 100).unique().notNullable();
    });
  }

  // Scope Management
  if (!(await knex.schema.hasTable('m_scopes'))) {
    await knex.schema.createTable('m_scopes', (table) => {
      table.increments('id').primary();
      table.string('name', 200).unique().notNullable();
    });
  }

  // Configuration Management (key-value store)
  if (!(await knex.schema.hasTable('m_config'))) {
    await knex.schema.createTable('m_config', (table) => {
      table.string('key').primary();
      table.text('value').notNullable();
    });
  }

  // Task Statuses (enum-like table)
  if (!(await knex.schema.hasTable('m_task_statuses'))) {
    await knex.schema.createTable('m_task_statuses', (table) => {
      table.integer('id').primary();
      table.string('name', 50).unique().notNullable();
    });
  }

  console.log('✅ Master tables created successfully');
}


export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order to handle dependencies
  await knex.schema.dropTableIfExists('m_task_statuses');
  await knex.schema.dropTableIfExists('m_config');
  await knex.schema.dropTableIfExists('m_scopes');
  await knex.schema.dropTableIfExists('m_tags');
  await knex.schema.dropTableIfExists('m_layers');
  await knex.schema.dropTableIfExists('m_constraint_categories');
  await knex.schema.dropTableIfExists('m_context_keys');
  await knex.schema.dropTableIfExists('m_files');
  await knex.schema.dropTableIfExists('m_agents');

  console.log('✅ Master tables dropped successfully');
}
