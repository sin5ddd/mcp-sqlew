import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Master Tables (m_ prefix) - Normalization Layer
  // ============================================================================

  // Agent Management
  await knex.schema.createTableIfNotExists('m_agents', (table) => {
    table.increments('id').primary();
    table.string('name', 100).unique().notNullable();
  });

  // File Path Management
  await knex.schema.createTableIfNotExists('m_files', (table) => {
    table.increments('id').primary();
    table.string('path', 1000).unique().notNullable();
  });

  // Context Key Management
  await knex.schema.createTableIfNotExists('m_context_keys', (table) => {
    table.increments('id').primary();
    table.string('key', 200).unique().notNullable();
  });

  // Constraint Category Management
  await knex.schema.createTableIfNotExists('m_constraint_categories', (table) => {
    table.increments('id').primary();
    table.string('name', 100).unique().notNullable();
  });

  // Layer Management (5 predefined layers)
  await knex.schema.createTableIfNotExists('m_layers', (table) => {
    table.increments('id').primary();
    table.string('name', 50).unique().notNullable();
  });

  // Tag Management
  await knex.schema.createTableIfNotExists('m_tags', (table) => {
    table.increments('id').primary();
    table.string('name', 100).unique().notNullable();
  });

  // Scope Management
  await knex.schema.createTableIfNotExists('m_scopes', (table) => {
    table.increments('id').primary();
    table.string('name', 200).unique().notNullable();
  });

  // Configuration Management (key-value store)
  await knex.schema.createTableIfNotExists('m_config', (table) => {
    table.string('key').primary();
    table.text('value').notNullable();
  });

  // Task Statuses (enum-like table)
  const hasTaskStatuses = await knex.schema.hasTable('m_task_statuses');
  if (!hasTaskStatuses) {
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

