import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Initial Data Seeding
  // Database-aware INSERT syntax: SQLite uses "INSERT OR IGNORE", MySQL/MariaDB use "INSERT IGNORE"
  // ============================================================================

  const isMySQL = knex.client.config.client === 'mysql2';
  const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';

  // Seed layers (5 predefined architecture layers)
  await knex.raw(`
    ${insertIgnore} INTO m_layers (id, name) VALUES
      (1, 'presentation'),
      (2, 'business'),
      (3, 'data'),
      (4, 'infrastructure'),
      (5, 'cross-cutting')
  `);

  // Seed constraint categories
  await knex.raw(`
    ${insertIgnore} INTO m_constraint_categories (name) VALUES
      ('architecture'),
      ('security'),
      ('performance'),
      ('compatibility'),
      ('maintainability')
  `);

  // Seed common tags
  await knex.raw(`
    ${insertIgnore} INTO m_tags (name) VALUES
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
  // Note: 'key' and 'value' are MySQL reserved words, so we escape them with backticks for MySQL/MariaDB
  const keyCol = isMySQL ? '`key`' : 'key';
  const valueCol = isMySQL ? '`value`' : 'value';

  await knex.raw(`
    ${insertIgnore} INTO m_config (${keyCol}, ${valueCol}) VALUES
      ('autodelete_ignore_weekend', '1'),
      ('autodelete_message_hours', '24'),
      ('autodelete_file_history_days', '7')
  `);

  // Seed task statuses
  await knex.raw(`
    ${insertIgnore} INTO m_task_statuses (id, name) VALUES
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
