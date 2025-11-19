import type { Knex } from "knex";

/**
 * Migration: Fix MySQL/MariaDB Index Syntax (Bootstrap Hotfix)
 *
 * Problem: The previous migration (20251025021351_create_indexes.ts) uses
 * SQLite-specific "CREATE INDEX IF NOT EXISTS" syntax which fails on MySQL/MariaDB.
 *
 * Solution: This migration runs immediately after the index creation migration
 * and fixes any indexes that failed to create due to syntax errors.
 *
 * Note: This is a hotfix migration. We cannot edit the pushed bootstrap migration.
 * Timestamp 20251025021352 ensures this runs right after 20251025021351.
 */

async function createIndexIfNotExists(
  knex: Knex,
  tableName: string,
  columns: string | string[],
  indexName: string,
  desc: boolean = false
): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';
  const isMySQL = client === 'mysql2' || client === 'mysql';
  const isPostgreSQL = client === 'pg' || client === 'postgresql';

  // SQLite: Original migration already handled
  if (isSQLite) {
    return;
  }

  // Check if table exists
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) {
    return;
  }

  // Check if index already exists
  let indexExists = false;

  if (isMySQL) {
    const result = await knex.raw(`
      SELECT DISTINCT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `, [tableName, indexName]);

    indexExists = result[0].length > 0;
  } else if (isPostgreSQL) {
    const result = await knex.raw(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = ?
        AND indexname = ?
    `, [tableName, indexName]);

    indexExists = result.rows.length > 0;
  }

  if (indexExists) {
    return;
  }

  // Create index with database-specific syntax
  const columnArray = Array.isArray(columns) ? columns : [columns];
  const order = desc ? 'DESC' : '';

  if (isMySQL) {
    // MySQL needs special handling for reserved keywords like 'read'
    const quotedColumns = columnArray.map(col => {
      if (col === 'read' || col === 'desc' || col === 'order' || col === 'key') {
        return `\`${col}\``;
      }
      return col;
    }).join(', ');

    await knex.raw(`CREATE INDEX ${indexName} ON ${tableName}(${quotedColumns} ${order})`.trim());
  } else if (isPostgreSQL) {
    // PostgreSQL needs double quotes for reserved keywords
    const quotedColumns = columnArray.map(col => {
      if (col === 'read' || col === 'desc' || col === 'order' || col === 'key') {
        return `"${col}"`;
      }
      return col;
    }).join(', ');

    await knex.raw(`CREATE INDEX ${indexName} ON ${tableName}(${quotedColumns} ${order})`.trim());
  }
}

export async function up(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  // Skip on SQLite - original migration works fine
  if (isSQLite) {
    console.log('✓ SQLite: Original index creation works correctly');
    return;
  }

  console.log(`🔧 Fixing MySQL/PostgreSQL index creation for ${client}...`);

  // Recreate all indexes that failed in the previous migration
  await createIndexIfNotExists(knex, 't_decisions', 'ts', 'idx_decisions_ts', true);
  await createIndexIfNotExists(knex, 't_decisions', 'layer_id', 'idx_decisions_layer');
  await createIndexIfNotExists(knex, 't_decisions', 'agent_id', 'idx_decisions_agent');
  await createIndexIfNotExists(knex, 't_decisions', 'status', 'idx_decisions_status');

  await createIndexIfNotExists(knex, 't_decisions_numeric', 'ts', 'idx_decisions_numeric_ts', true);
  await createIndexIfNotExists(knex, 't_decisions_numeric', 'layer_id', 'idx_decisions_numeric_layer');

  await createIndexIfNotExists(knex, 't_agent_messages', 'ts', 'idx_messages_ts', true);
  await createIndexIfNotExists(knex, 't_agent_messages', ['to_agent_id', 'read'], 'idx_messages_to_agent');
  await createIndexIfNotExists(knex, 't_agent_messages', 'priority', 'idx_messages_priority', true);

  await createIndexIfNotExists(knex, 't_file_changes', 'ts', 'idx_file_changes_ts', true);
  await createIndexIfNotExists(knex, 't_file_changes', 'file_id', 'idx_file_changes_file');
  await createIndexIfNotExists(knex, 't_file_changes', 'layer_id', 'idx_file_changes_layer');

  await createIndexIfNotExists(knex, 't_constraints', 'active', 'idx_constraints_active');
  await createIndexIfNotExists(knex, 't_constraints', 'layer_id', 'idx_constraints_layer');
  await createIndexIfNotExists(knex, 't_constraints', 'priority', 'idx_constraints_priority', true);

  await createIndexIfNotExists(knex, 't_activity_log', 'ts', 'idx_activity_log_ts', true);
  await createIndexIfNotExists(knex, 't_activity_log', 'agent_id', 'idx_activity_log_agent');

  await createIndexIfNotExists(knex, 't_tasks', 'status_id', 'idx_tasks_status');
  await createIndexIfNotExists(knex, 't_tasks', 'priority', 'idx_tasks_priority', true);
  await createIndexIfNotExists(knex, 't_tasks', 'assigned_agent_id', 'idx_tasks_agent');
  await createIndexIfNotExists(knex, 't_tasks', 'created_ts', 'idx_tasks_created_ts', true);
  await createIndexIfNotExists(knex, 't_tasks', 'updated_ts', 'idx_tasks_updated_ts', true);

  console.log('✅ MySQL/PostgreSQL indexes created successfully');
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isSQLite = client === 'sqlite3' || client === 'better-sqlite3';

  if (isSQLite) {
    console.log('✓ SQLite: No rollback needed');
    return;
  }

  // Drop all indexes (MySQL/PostgreSQL syntax)
  const indexes = [
    'idx_decisions_ts',
    'idx_decisions_layer',
    'idx_decisions_agent',
    'idx_decisions_status',
    'idx_decisions_numeric_ts',
    'idx_decisions_numeric_layer',
    'idx_messages_ts',
    'idx_messages_to_agent',
    'idx_messages_priority',
    'idx_file_changes_ts',
    'idx_file_changes_file',
    'idx_file_changes_layer',
    'idx_constraints_active',
    'idx_constraints_layer',
    'idx_constraints_priority',
    'idx_activity_log_ts',
    'idx_activity_log_agent',
    'idx_tasks_status',
    'idx_tasks_priority',
    'idx_tasks_agent',
    'idx_tasks_created_ts',
    'idx_tasks_updated_ts'
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }

  console.log('✅ Indexes dropped successfully');
}
