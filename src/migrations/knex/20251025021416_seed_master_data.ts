import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Initial Data Seeding
  // Using INSERT OR IGNORE to prevent errors when data already exists
  // ============================================================================

  // Seed layers (5 predefined architecture layers)
  await knex.raw(`
    INSERT OR IGNORE INTO m_layers (id, name) VALUES
      (1, 'presentation'),
      (2, 'business'),
      (3, 'data'),
      (4, 'infrastructure'),
      (5, 'cross-cutting')
  `);

  // Seed constraint categories
  await knex.raw(`
    INSERT OR IGNORE INTO m_constraint_categories (name) VALUES
      ('architecture'),
      ('security'),
      ('performance'),
      ('compatibility'),
      ('maintainability')
  `);

  // Seed common tags
  await knex.raw(`
    INSERT OR IGNORE INTO m_tags (name) VALUES
      ('authentication'),
      ('authorization'),
      ('validation'),
      ('error-handling'),
      ('logging'),
      ('performance'),
      ('security'),
      ('testing')
  `);

  // Seed configuration defaults
  await knex.raw(`
    INSERT OR IGNORE INTO m_config (key, value) VALUES
      ('autodelete_ignore_weekend', '1'),
      ('autodelete_message_hours', '24'),
      ('autodelete_file_history_days', '7')
  `);

  // Seed task statuses
  await knex.raw(`
    INSERT OR IGNORE INTO m_task_statuses (id, name) VALUES
      (1, 'todo'),
      (2, 'in_progress'),
      (3, 'waiting_review'),
      (4, 'blocked'),
      (5, 'done'),
      (6, 'archived')
  `);

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
