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
import { getTestConfig, getDockerConfig, type DatabaseType as ConfigDatabaseType } from '../database/testing-config.js';

const execAsync = promisify(exec);

/**
 * Execute async command with 30-second timeout to prevent hanging
 * (Docker commands can stall on Windows/WSL or when containers are not responding)
 */
const execAsyncWithTimeout = async (
  command: string,
  options: Parameters<typeof execAsync>[1] = {}
): Promise<{ stdout: string; stderr: string }> => {
  return execAsync(command, {
    timeout: 30000,           // 30-second timeout prevents hanging
    encoding: 'utf8',        // Force UTF-8 to prevent Buffer type issues
    ...options
  }) as Promise<{ stdout: string; stderr: string }>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Database Configuration
// ============================================================================

export type DatabaseType = ConfigDatabaseType;

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
  join(projectRoot, 'dist/database/migrations/v4'),
];

/**
 * Get database configuration by type
 * Now uses centralized testing-config.ts for consistent credentials
 */
export function getDbConfig(type: DatabaseType, customPath?: string): DbConfig {
  const knexConfig = getTestConfig(type);

  // For SQLite, override path if provided
  if (type === 'sqlite' && customPath) {
    knexConfig.connection = { filename: customPath };
  }

  // Add migration configuration for all databases
  if (!knexConfig.migrations) {
    knexConfig.migrations = {
      directory: migrationDirs,
      extension: 'js',
      tableName: 'knex_migrations',
      loadExtensions: ['.js'],
    };
  }

  // Get container name for Docker-based databases
  let containerName: string | undefined;
  if (type !== 'sqlite') {
    const dockerConfig = getDockerConfig(type);
    containerName = dockerConfig.name;
  }

  return {
    type,
    knexConfig,
    containerName,
  };
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
  await db('v4_decisions').where('key_id', '>=', 100).andWhere('key_id', '<=', 101).del();
  await db('v4_context_keys').where('id', '>=', 100).andWhere('id', '<=', 101).del();
  await db('v4_projects').where('name', 'like', 'test-project-%').del();

  // Seed v4_projects (use IDs 10, 20 to avoid conflicts)
  await db('v4_projects').insert([
    { id: 10, name: 'test-project-1', display_name: 'Test Project 1', detection_source: 'test', created_ts: now, last_active_ts: now },
    { id: 20, name: 'test-project-2', display_name: 'Test Project 2', detection_source: 'test', created_ts: now, last_active_ts: now },
  ]);

  // Note: v4_agents removed in v4.0 (agent tracking eliminated)

  // Seed v4_context_keys (use IDs 100, 101 to avoid conflicts)
  await db('v4_context_keys').insert([
    { id: 100, key_name: 'test/key1' },
    { id: 101, key_name: 'test/key2' },
  ]);

  // Seed v4_decisions (has FK to v4_projects, v4_context_keys)
  // Note: agent_id removed in v4.0
  await db('v4_decisions').insert([
    { key_id: 100, project_id: 10, value: 'test-value-1', ts: now },
    { key_id: 101, project_id: 20, value: 'test-value-2', ts: now },
  ]);
}

/**
 * Verify seeded data exists
 * Note: Migrations may create a default project (ID 1), so we check for our test projects specifically
 */
export async function assertSeededDataExists(db: Knex): Promise<void> {
  // Check for our specific test projects (IDs 10, 20)
  const testProjects = await db('v4_projects').whereIn('id', [10, 20]);
  assert.strictEqual(testProjects.length, 2, 'Should have 2 test projects (IDs 10, 20)');

  // Check for our test decisions
  const testDecisions = await db('v4_decisions').whereIn('key_id', [100, 101]);
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
    await execAsyncWithTimeout(`docker cp ${tempFile} ${containerName}:/tmp/import.sql`);

    // Import based on database type
    if (type === 'mysql' || type === 'mariadb') {
      await execAsyncWithTimeout(
        `docker exec ${containerName} mysql -u mcp_user -pmcp_pass mcp_test -e "SOURCE /tmp/import.sql"`
      );
    } else if (type === 'postgresql') {
      await execAsyncWithTimeout(
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

// ============================================================================
// Better-SQLite3 Test Lifecycle Helpers (v3.9.0)
// ============================================================================

/**
 * Force exit after test completion to prevent better-sqlite3 hanging
 *
 * **Problem**: better-sqlite3 native addon keeps Node.js event loop alive
 * even after proper cleanup (db.destroy(), etc.)
 *
 * **Solution**: Embed forced exit in the LAST test of each test suite
 *
 * **Usage**:
 * ```typescript
 * describe('My Test Suite', () => {
 *   it('test 1', async () => { ... });
 *   it('test 2', async () => { ... });
 *
 *   it('test 3 (LAST)', async () => {
 *     // ... test logic ...
 *
 *     // Call at the END of the last test
 *     forceExitAfterTest();
 *   });
 * });
 * ```
 *
 * **Why setImmediate()?**
 * - Executes after current test completes but before Node test runner's `after()` hook
 * - Allows test to finish properly and report results
 * - Prevents event loop from hanging after all tests pass
 *
 * **Token Efficiency**: Reduces need for manual process.exit(0) in every test file
 */
export function forceExitAfterTest(): void {
  setImmediate(async () => {
    try {
      // Database cleanup can be skipped for temporary test databases
      // better-sqlite3 handles cleanup internally before exit
    } catch (error) {
      // Ignore cleanup errors
    } finally {
      // Force exit immediately (better-sqlite3 keeps event loop alive)
      process.exit(0);
    }
  });
}

// ============================================================================
// Task and File Link Test Helpers (v3.9.0)
// ============================================================================

/**
 * Options for creating a test task
 */
export interface CreateTestTaskOptions {
  title: string;
  description?: string;
  status_id?: number;
  priority?: number;
  projectId?: number;
  agentName?: string;
  acceptance_criteria?: string;
}

/**
 * Create a test task with all required fields including timestamps
 *
 * **v4.0.0+ Compatible**: Uses v4_tasks and v4_task_details tables
 * **v3.8.0+ Compatible**: Includes created_ts and updated_ts (NOT NULL fields)
 * **v3.7.0+ Compatible**: Uses provided projectId (required for multi-project support)
 *
 * @param db - Knex database connection
 * @param options - Task creation options
 * @returns Task ID
 */
export async function createTestTask(
  db: Knex,
  options: CreateTestTaskOptions
): Promise<number> {
  const currentTs = Math.floor(Date.now() / 1000);

  // Note: Agent tracking removed in v4.0 - no agent lookup needed

  // Create task with all required fields
  // Note: assigned_agent_id and created_by_agent_id removed in v4.0
  const [taskId] = await db('v4_tasks')
    .insert({
      title: options.title,
      status_id: options.status_id || 1, // Default to 'todo' (status_id=1)
      priority: options.priority || 2,
      project_id: options.projectId || 1, // Default to project 1 if not specified
      created_ts: currentTs,  // Required NOT NULL field
      updated_ts: currentTs   // Required NOT NULL field
    })
    .returning('id');

  const actualTaskId = taskId?.id || taskId;

  // Add task details if description or acceptance_criteria provided
  if (options.description || options.acceptance_criteria) {
    await db('v4_task_details').insert({
      task_id: actualTaskId,
      description: options.description || null,
      acceptance_criteria: options.acceptance_criteria || null
    });
  }

  return actualTaskId;
}

/**
 * Add watched files to a task with v4.0+ schema compatibility
 *
 * **v4.0+ Schema Changes**:
 * - Uses v4_files table (path_hash removed in v4, uses path directly)
 * - Uses v4_task_file_links table with linked_ts
 * - Added action field (default 'edit')
 * - UNIQUE constraint: `(task_id, project_id, file_id)`
 *
 * @param db - Knex database connection
 * @param taskId - Task ID to link files to
 * @param filePaths - Array of file paths to watch
 * @param projectId - Project ID (required for multi-project support)
 * @returns Array of successfully added file paths
 */
export async function addWatchedFiles(
  db: Knex,
  taskId: number,
  filePaths: string[],
  projectId: number = 1
): Promise<string[]> {
  const addedFiles: string[] = [];
  const currentTs = Math.floor(Date.now() / 1000);

  for (const filePath of filePaths) {
    try {
      // Get or create file
      let fileId: number;

      // v4 schema: no path_hash, use path directly with project_id
      const existingFile = await db('v4_files')
        .where({ project_id: projectId, path: filePath })
        .first('id');

      if (existingFile) {
        fileId = existingFile.id;
      } else {
        const [newFileId] = await db('v4_files')
          .insert({ project_id: projectId, path: filePath })
          .returning('id');
        fileId = newFileId?.id || newFileId;
      }

      // Add file link with v4.0 schema fields
      await db('v4_task_file_links')
        .insert({
          task_id: taskId,
          file_id: fileId,
          project_id: projectId,
          action: 'edit',  // Default action
          linked_ts: currentTs  // Required v4 field
        })
        .onConflict(['task_id', 'project_id', 'file_id'])  // v4.0 UNIQUE constraint
        .ignore();

      addedFiles.push(filePath);
    } catch (error) {
      console.error(`Error adding file ${filePath}:`, error);
      // Continue with next file
    }
  }

  return addedFiles;
}

/**
 * Create a pruned file record in the audit table
 *
 * **v4.0+ Compatible**: Uses v4_task_pruned_files table with pruned_ts field
 * **v4.0+ Compatible**: Includes project_id (required for multi-project support)
 * **v3.5.0+ Feature**: Auto-pruning audit trail
 *
 * @param db - Knex database connection
 * @param taskId - Task ID
 * @param filePath - File path that was pruned
 * @param projectId - Project ID (required for multi-project support)
 * @returns Pruned file record ID
 */
export async function createPrunedFileRecord(
  db: Knex,
  taskId: number,
  filePath: string,
  projectId: number = 1
): Promise<number> {
  const currentTs = Math.floor(Date.now() / 1000);

  const [id] = await db('v4_task_pruned_files')
    .insert({
      task_id: taskId,
      file_path: filePath,
      pruned_ts: currentTs,  // v4 uses pruned_ts
      project_id: projectId,
      action: 'edit'  // Default action
    })
    .returning('id');

  return id?.id || id;
}

/**
 * Get watched files for a task
 *
 * **v4.0+ Compatible**: Uses v4_task_file_links and v4_files tables
 *
 * @param db - Knex database connection
 * @param taskId - Task ID
 * @returns Array of file paths
 */
export async function getWatchedFiles(
  db: Knex,
  taskId: number
): Promise<string[]> {
  const files = await db('v4_task_file_links as tfl')
    .join('v4_files as f', 'tfl.file_id', 'f.id')
    .where('tfl.task_id', taskId)
    .select('f.path')
    .orderBy('f.path');

  return files.map(f => f.path);
}
