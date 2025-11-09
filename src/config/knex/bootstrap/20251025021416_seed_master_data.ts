import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // Initial Data Seeding
  // Database-aware INSERT syntax:
  // - SQLite: INSERT OR IGNORE
  // - MySQL/MariaDB: INSERT IGNORE
  // - PostgreSQL: INSERT ... ON CONFLICT DO NOTHING
  // ============================================================================

  const client = knex.client.config.client;
  const isMySQL = client === 'mysql2' || client === 'mysql';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Seed layers (5 predefined architecture layers)
  if (isPostgreSQL) {
    await knex.raw(`
      INSERT INTO m_layers (id, name) VALUES
        (1, 'presentation'),
        (2, 'business'),
        (3, 'data'),
        (4, 'infrastructure'),
        (5, 'cross-cutting')
      ON CONFLICT (id) DO NOTHING
    `);
  } else {
    const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(`
      ${insertIgnore} INTO m_layers (id, name) VALUES
        (1, 'presentation'),
        (2, 'business'),
        (3, 'data'),
        (4, 'infrastructure'),
        (5, 'cross-cutting')
    `);
  }

  // Seed constraint categories
  if (isPostgreSQL) {
    await knex.raw(`
      INSERT INTO m_constraint_categories (name) VALUES
        ('architecture'),
        ('security'),
        ('performance'),
        ('compatibility'),
        ('maintainability')
      ON CONFLICT (name) DO NOTHING
    `);
  } else {
    const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(`
      ${insertIgnore} INTO m_constraint_categories (name) VALUES
        ('architecture'),
        ('security'),
        ('performance'),
        ('compatibility'),
        ('maintainability')
    `);
  }

  // Seed common tags
  if (isPostgreSQL) {
    await knex.raw(`
      INSERT INTO m_tags (project_id, name) VALUES
        (1, 'authentication'),
        (1, 'authorization'),
        (1, 'validation'),
        (1, 'error-handling'),
        (1, 'logging'),
        (1, 'performance'),
        (1, 'security'),
        (1, 'testing')
      ON CONFLICT (project_id, name) DO NOTHING
    `);
  } else {
    const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(`
      ${insertIgnore} INTO m_tags (project_id, name) VALUES
        (1, 'authentication'),
        (1, 'authorization'),
        (1, 'validation'),
        (1, 'error-handling'),
        (1, 'logging'),
        (1, 'performance'),
        (1, 'security'),
        (1, 'testing')
    `);
  }

  // Seed configuration defaults
  // Note: 'key' and 'value' are MySQL reserved words, so we escape them with backticks for MySQL/MariaDB
  const keyCol = isMySQL ? '`key`' : 'key';
  const valueCol = isMySQL ? '`value`' : 'value';

  if (isPostgreSQL) {
    await knex.raw(`
      INSERT INTO m_config (key, value) VALUES
        ('autodelete_ignore_weekend', '1'),
        ('autodelete_message_hours', '24'),
        ('autodelete_file_history_days', '7')
      ON CONFLICT (key) DO NOTHING
    `);
  } else {
    const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(`
      ${insertIgnore} INTO m_config (${keyCol}, ${valueCol}) VALUES
        ('autodelete_ignore_weekend', '1'),
        ('autodelete_message_hours', '24'),
        ('autodelete_file_history_days', '7')
    `);
  }

  // Seed task statuses
  if (isPostgreSQL) {
    await knex.raw(`
      INSERT INTO m_task_statuses (id, name) VALUES
        (1, 'todo'),
        (2, 'in_progress'),
        (3, 'waiting_review'),
        (4, 'blocked'),
        (5, 'done'),
        (6, 'archived')
      ON CONFLICT (id) DO NOTHING
    `);
  } else {
    const insertIgnore = isMySQL ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await knex.raw(`
      ${insertIgnore} INTO m_task_statuses (id, name) VALUES
        (1, 'todo'),
        (2, 'in_progress'),
        (3, 'waiting_review'),
        (4, 'blocked'),
        (5, 'done'),
        (6, 'archived')
    `);
  }

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
