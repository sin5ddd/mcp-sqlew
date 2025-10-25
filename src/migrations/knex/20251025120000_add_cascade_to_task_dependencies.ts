import type { Knex } from "knex";

/**
 * Add CASCADE deletion to t_task_dependencies foreign keys
 * This allows tasks to be deleted even if they have dependencies
 */

export async function up(knex: Knex): Promise<void> {
  // SQLite doesn't support ALTER TABLE to modify foreign keys
  // We need to recreate the table with CASCADE constraints
  // Must use raw SQL because Knex doesn't properly generate ON DELETE CASCADE for SQLite

  // 1. Create temporary table with CASCADE constraints (using current column names)
  await knex.raw(`
    CREATE TABLE t_task_dependencies_new (
      blocker_task_id INTEGER,
      blocked_task_id INTEGER,
      created_ts INTEGER NOT NULL,
      PRIMARY KEY (blocker_task_id, blocked_task_id),
      FOREIGN KEY (blocker_task_id) REFERENCES t_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_task_id) REFERENCES t_tasks(id) ON DELETE CASCADE
    )
  `);

  // 2. Copy data from old table to new table
  await knex.raw(`
    INSERT INTO t_task_dependencies_new (blocker_task_id, blocked_task_id, created_ts)
    SELECT blocker_task_id, blocked_task_id, created_ts
    FROM t_task_dependencies
  `);

  // 3. Drop old table
  await knex.schema.dropTable('t_task_dependencies');

  // 4. Rename new table to original name
  await knex.schema.renameTable('t_task_dependencies_new', 't_task_dependencies');

  console.log('✅ Added CASCADE deletion to t_task_dependencies foreign keys');
}

export async function down(knex: Knex): Promise<void> {
  // Revert to non-CASCADE foreign keys
  await knex.schema.createTable('t_task_dependencies_new', (table) => {
    table.integer('blocker_task_id');
    table.foreign('blocker_task_id').references('t_tasks.id');
    table.integer('blocked_task_id');
    table.foreign('blocked_task_id').references('t_tasks.id');
    table.integer('created_ts').notNullable();
    table.primary(['blocker_task_id', 'blocked_task_id']);
  });

  await knex.raw(`
    INSERT INTO t_task_dependencies_new (blocker_task_id, blocked_task_id, created_ts)
    SELECT blocker_task_id, blocked_task_id, created_ts
    FROM t_task_dependencies
  `);

  await knex.schema.dropTable('t_task_dependencies');
  await knex.schema.renameTable('t_task_dependencies_new', 't_task_dependencies');

  console.log('✅ Reverted CASCADE deletion from t_task_dependencies foreign keys');
}
