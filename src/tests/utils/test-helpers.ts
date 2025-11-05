/**
 * Shared Test Utilities for Cross-Database Migration Tests
 *
 * DRY principle: All common test setup, assertions, and helpers in one place.
 * Used by all 5 test suites to avoid code duplication.
 */

import knex, { Knex } from 'knex';
import assert from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Database Configuration
// ============================================================================

export type DatabaseType = 'sqlite' | 'mysql' | 'mariadb' | 'postgresql';

export interface DbConfig {
  type: DatabaseType;
  knexConfig: Knex.Config;
  containerName?: string;
}

// Migration directories - resolve based on whether we're in dist/ or src/
// When running tests, we're in dist/tests/utils/, so ../../config/knex/ is wrong
// We need to go to the project root first
const projectRoot = join(__dirname, '../../../'); // dist/tests/utils/ -> project root
const migrationDirs = [
  join(projectRoot, 'dist/config/knex/bootstrap'),
  join(projectRoot, 'dist/config/knex/upgrades'),
  join(projectRoot, 'dist/config/knex/enhancements'),
];

/**
 * Get database configuration by type
 */
export function getDbConfig(type: DatabaseType, customPath?: string): DbConfig {
  switch (type) {
    case 'sqlite':
      return {
        type: 'sqlite',
        knexConfig: {
          client: 'better-sqlite3',
          connection: { filename: customPath || ':memory:' },
          useNullAsDefault: true,
          migrations: {
            directory: migrationDirs,
            extension: 'js',
            tableName: 'knex_migrations',
            loadExtensions: ['.js'],
          },
        },
      };

    case 'mysql':
      return {
        type: 'mysql',
        containerName: 'mcp-sqlew-mysql-test',
        knexConfig: {
          client: 'mysql2',
          connection: {
            host: 'localhost',
            port: 3307,
            user: 'mcp_user',
            password: 'mcp_pass',
            database: 'mcp_test',
          },
        },
      };

    case 'mariadb':
      return {
        type: 'mariadb',
        containerName: 'mcp-sqlew-mariadb-test',
        knexConfig: {
          client: 'mysql2',
          connection: {
            host: 'localhost',
            port: 3308,
            user: 'mcp_user',
            password: 'mcp_pass',
            database: 'mcp_test',
          },
        },
      };

    case 'postgresql':
      return {
        type: 'postgresql',
        containerName: 'mcp-sqlew-postgres-test',
        knexConfig: {
          client: 'pg',
          connection: {
            host: 'localhost',
            port: 5432,
            user: 'mcp_user',
            password: 'mcp_pass',
            database: 'mcp_test',
          },
        },
      };
  }
}

// ============================================================================
// Database Connection Helpers (DRY)
// ============================================================================

/**
 * Create and verify database connection
 */
export async function connectDb(config: DbConfig): Promise<Knex> {
  const db = knex(config.knexConfig);

  try {
    await db.raw('SELECT 1');
    return db;
  } catch (error: any) {
    throw new Error(`Failed to connect to ${config.type}: ${error.message}`);
  }
}

/**
 * Close database connection safely
 */
export async function disconnectDb(db: Knex): Promise<void> {
  try {
    await db.destroy();
  } catch (error) {
    // Ignore disconnect errors
  }
}

/**
 * Drop all tables and views from database
 */
export async function dropAllTables(db: Knex, type: DatabaseType): Promise<void> {
  if (type === 'sqlite') {
    // SQLite: Get all tables and views, then drop them
    const objects = await db.raw(`
      SELECT name, type FROM sqlite_master
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
    `);

    await db.raw('PRAGMA foreign_keys = OFF');
    for (const row of objects) {
      if (row.type === 'view') {
        await db.raw(`DROP VIEW IF EXISTS "${row.name}"`);
      } else {
        await db.raw(`DROP TABLE IF EXISTS "${row.name}"`);
      }
    }
    await db.raw('PRAGMA foreign_keys = ON');

  } else if (type === 'mysql' || type === 'mariadb') {
    // MySQL/MariaDB: Drop all views first, then tables
    await db.raw('SET FOREIGN_KEY_CHECKS=0');

    // Drop views
    const views = await db.raw(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'mcp_test' AND TABLE_TYPE = 'VIEW'
    `);

    for (const row of views[0]) {
      await db.raw(`DROP VIEW IF EXISTS ??`, [row.TABLE_NAME]);
    }

    // Drop tables
    const tables = await db.raw(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'mcp_test' AND TABLE_TYPE = 'BASE TABLE'
    `);

    for (const row of tables[0]) {
      await db.raw(`DROP TABLE IF EXISTS ??`, [row.TABLE_NAME]);
    }
    await db.raw('SET FOREIGN_KEY_CHECKS=1');

  } else if (type === 'postgresql') {
    // PostgreSQL: Drop and recreate schema (drops both tables and views)
    await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
    await db.raw('CREATE SCHEMA public');
  }
}

// ============================================================================
// Schema Comparison Utilities (DRY)
// ============================================================================

export interface TableInfo {
  name: string;
  columnCount: number;
  rowCount: number;
}

/**
 * Get list of tables in database
 */
export async function getTables(db: Knex, type: DatabaseType): Promise<string[]> {
  if (type === 'sqlite') {
    const result = await db.raw(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
      ORDER BY name
    `);
    return result.map((r: any) => r.name);

  } else if (type === 'mysql' || type === 'mariadb') {
    const result = await db.raw(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'mcp_test'
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME != 'knex_migrations'
      ORDER BY TABLE_NAME
    `);
    return result[0].map((r: any) => r.TABLE_NAME);

  } else if (type === 'postgresql') {
    const result = await db.raw(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename != 'knex_migrations'
      ORDER BY tablename
    `);
    return result.rows.map((r: any) => r.tablename);
  }

  return [];
}

/**
 * Get table information (columns, rows)
 */
export async function getTableInfo(db: Knex, tableName: string): Promise<TableInfo> {
  const columnInfo = await db(tableName).columnInfo();
  const rowCount = await db(tableName).count('* as count').first();

  return {
    name: tableName,
    columnCount: Object.keys(columnInfo).length,
    rowCount: Number(rowCount?.count || 0),
  };
}

/**
 * Assert table counts match between two databases
 */
export async function assertTableCountsMatch(
  sourceDb: Knex,
  sourceType: DatabaseType,
  targetDb: Knex,
  targetType: DatabaseType,
  message?: string
): Promise<void> {
  const sourceTables = await getTables(sourceDb, sourceType);
  const targetTables = await getTables(targetDb, targetType);

  assert.strictEqual(
    targetTables.length,
    sourceTables.length,
    message || `Table count mismatch: ${sourceType} has ${sourceTables.length}, ${targetType} has ${targetTables.length}`
  );
}

/**
 * Assert row counts match for a specific table
 */
export async function assertRowCountsMatch(
  sourceDb: Knex,
  targetDb: Knex,
  tableName: string,
  message?: string
): Promise<void> {
  const sourceCount = await sourceDb(tableName).count('* as count').first();
  const targetCount = await targetDb(tableName).count('* as count').first();

  assert.strictEqual(
    Number(targetCount?.count || 0),
    Number(sourceCount?.count || 0),
    message || `Row count mismatch in ${tableName}`
  );
}

// ============================================================================
// FK Constraint Helpers (DRY)
// ============================================================================

export interface FKConstraintInfo {
  tableName: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

/**
 * Get foreign key constraints from database
 */
export async function getFKConstraints(db: Knex, type: DatabaseType, tableName: string): Promise<FKConstraintInfo[]> {
  const constraints: FKConstraintInfo[] = [];

  if (type === 'sqlite') {
    const result = await db.raw(`PRAGMA foreign_key_list(${tableName})`);
    for (const fk of result) {
      constraints.push({
        tableName,
        columnName: fk.from,
        referencedTable: fk.table,
        referencedColumn: fk.to,
        onDelete: fk.on_delete,
        onUpdate: fk.on_update,
      });
    }

  } else if (type === 'mysql' || type === 'mariadb') {
    const result = await db.raw(`
      SELECT
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'mcp_test'
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName]);

    for (const fk of result[0]) {
      constraints.push({
        tableName,
        columnName: fk.COLUMN_NAME,
        referencedTable: fk.REFERENCED_TABLE_NAME,
        referencedColumn: fk.REFERENCED_COLUMN_NAME,
      });
    }

  } else if (type === 'postgresql') {
    const result = await db.raw(`
      SELECT
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ?
    `, [tableName]);

    for (const fk of result.rows) {
      constraints.push({
        tableName,
        columnName: fk.column_name,
        referencedTable: fk.referenced_table,
        referencedColumn: fk.referenced_column,
      });
    }
  }

  return constraints;
}

/**
 * Assert FK constraints exist for a table
 */
export async function assertFKConstraintsExist(
  db: Knex,
  type: DatabaseType,
  tableName: string,
  expectedCount: number,
  message?: string
): Promise<void> {
  const constraints = await getFKConstraints(db, type, tableName);

  assert.ok(
    constraints.length >= expectedCount,
    message || `Expected at least ${expectedCount} FK constraints on ${tableName}, found ${constraints.length}`
  );
}

// ============================================================================
// Data Seeding Helpers (DRY)
// ============================================================================

/**
 * Seed test data with FK relationships
 * Creates a simple schema: projects → agents → context_keys → decisions
 */
export async function seedTestData(db: Knex): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Clear existing test data (use test IDs 10, 20, 100, 101 to avoid conflicts with migration-created data)
  await db('t_decisions').where('key_id', '>=', 100).andWhere('key_id', '<=', 101).del();
  await db('m_context_keys').where('id', '>=', 100).andWhere('id', '<=', 101).del();
  await db('m_agents').where('name', 'test-agent').del();
  await db('m_projects').where('name', 'like', 'test-project-%').del();

  // Seed m_projects (use IDs 10, 20 to avoid conflicts)
  await db('m_projects').insert([
    { id: 10, name: 'test-project-1', display_name: 'Test Project 1', detection_source: 'test', created_ts: now, last_active_ts: now },
    { id: 20, name: 'test-project-2', display_name: 'Test Project 2', detection_source: 'test', created_ts: now, last_active_ts: now },
  ]);

  // Seed m_agents (use ID 100 to avoid conflicts)
  await db('m_agents').insert([
    { id: 100, name: 'test-agent' },
  ]);

  // Seed m_context_keys (use IDs 100, 101 to avoid conflicts)
  await db('m_context_keys').insert([
    { id: 100, key: 'test/key1' },
    { id: 101, key: 'test/key2' },
  ]);

  // Seed t_decisions (has FK to m_projects, m_agents, m_context_keys)
  await db('t_decisions').insert([
    { key_id: 100, project_id: 10, value: 'test-value-1', ts: now, agent_id: 100 },
    { key_id: 101, project_id: 20, value: 'test-value-2', ts: now, agent_id: 100 },
  ]);
}

/**
 * Verify seeded data exists
 * Note: Migrations may create a default project (ID 1), so we check for our test projects specifically
 */
export async function assertSeededDataExists(db: Knex): Promise<void> {
  // Check for our specific test projects (IDs 10, 20)
  const testProjects = await db('m_projects').whereIn('id', [10, 20]);
  assert.strictEqual(testProjects.length, 2, 'Should have 2 test projects (IDs 10, 20)');

  // Check for our test decisions
  const testDecisions = await db('t_decisions').whereIn('key_id', [100, 101]);
  assert.strictEqual(testDecisions.length, 2, 'Should have 2 test decisions (key_ids 100, 101)');
}

// ============================================================================
// SQL Import Helpers (DRY)
// ============================================================================

/**
 * Import SQL dump to database via Docker container
 */
export async function importSqlToDocker(
  sql: string,
  containerName: string,
  type: 'mysql' | 'mariadb' | 'postgresql'
): Promise<void> {
  const tempFile = `/tmp/sqlew-test-${Date.now()}.sql`;
  writeFileSync(tempFile, sql);

  try {
    // Copy file to container
    await execAsync(`docker cp ${tempFile} ${containerName}:/tmp/import.sql`);

    // Import based on database type
    if (type === 'mysql' || type === 'mariadb') {
      await execAsync(
        `docker exec ${containerName} mysql -u mcp_user -pmcp_pass mcp_test -e "SOURCE /tmp/import.sql"`
      );
    } else if (type === 'postgresql') {
      await execAsync(
        `docker exec ${containerName} psql -U mcp_user -d mcp_test -f /tmp/import.sql -v ON_ERROR_STOP=1 -q`
      );
    }
  } finally {
    // Clean up temp file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
}

// ============================================================================
// Test Lifecycle Helpers (DRY)
// ============================================================================

export interface TestContext {
  dbs: Map<DatabaseType, Knex>;
  configs: Map<DatabaseType, DbConfig>;
}

/**
 * Setup test context with multiple databases
 */
export async function setupTestContext(types: DatabaseType[]): Promise<TestContext> {
  const dbs = new Map<DatabaseType, Knex>();
  const configs = new Map<DatabaseType, DbConfig>();

  for (const type of types) {
    const config = getDbConfig(type);
    configs.set(type, config);

    try {
      const db = await connectDb(config);
      dbs.set(type, db);
    } catch (error: any) {
      // Clean up already connected databases
      for (const [, db] of dbs) {
        await disconnectDb(db);
      }
      throw error;
    }
  }

  return { dbs, configs };
}

/**
 * Teardown test context (close all connections)
 */
export async function teardownTestContext(context: TestContext): Promise<void> {
  for (const [, db] of context.dbs) {
    await disconnectDb(db);
  }
}
