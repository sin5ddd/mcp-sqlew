import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Initial Data Seeding
  // ============================================================================

  // Seed layers (5 predefined architecture layers)
  await knex('m_layers').insert([
    { id: 1, name: 'presentation' },
    { id: 2, name: 'business' },
    { id: 3, name: 'data' },
    { id: 4, name: 'infrastructure' },
    { id: 5, name: 'cross-cutting' },
  ]);

  // Seed constraint categories
  await knex('m_constraint_categories').insert([
    { name: 'architecture' },
    { name: 'security' },
    { name: 'performance' },
    { name: 'compatibility' },
    { name: 'maintainability' },
  ]);

  // Seed common tags
  await knex('m_tags').insert([
    { name: 'authentication' },
    { name: 'authorization' },
    { name: 'validation' },
    { name: 'error-handling' },
    { name: 'logging' },
    { name: 'performance' },
    { name: 'security' },
    { name: 'testing' },
  ]);

  // Seed configuration defaults
  await knex('m_config').insert([
    { key: 'autodelete_ignore_weekend', value: '1' },
    { key: 'autodelete_message_hours', value: '24' },
    { key: 'autodelete_file_history_days', value: '7' },
  ]);

  // Seed task statuses
  await knex('m_task_statuses').insert([
    { id: 1, name: 'todo' },
    { id: 2, name: 'in_progress' },
    { id: 3, name: 'waiting_review' },
    { id: 4, name: 'blocked' },
    { id: 5, name: 'done' },
    { id: 6, name: 'archived' },
  ]);

  console.log('✅ Master data seeded successfully');
}


export async function down(knex: Knex): Promise<void> {
  // Clear all seeded data
  await knex('m_task_statuses').del();
  await knex('m_config').del();
  await knex('m_tags').del();
  await knex('m_constraint_categories').del();
  await knex('m_layers').del();

  console.log('✅ Master data cleared');
}

