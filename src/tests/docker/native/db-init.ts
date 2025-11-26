/**
 * Native RDBMS Database Initialization
 *
 * Handles fresh database setup via Knex migrations for
 * MySQL, MariaDB, and PostgreSQL integration tests.
 *
 * Key Features:
 * - Initialize fresh database with all migrations
 * - Verify migration success
 * - Clean teardown with proper disconnect
 */

import knex, { Knex } from 'knex';
import assert from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getTestConfig, type DatabaseType } from '../../database/testing-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Migration Directory Configuration
// ============================================================================

/**
 * Get migration directory paths
 *
 * Migrations must be compiled before tests run (npx tsc).
 * Resolves paths based on dist/ directory structure.
 */
function getMigrationDirs(): string[] {
  // From dist/tests/docker/native/ -> dist/database/migrations/
  const projectRoot = join(__dirname, '../../../..'); // dist/tests/docker/native -> project root

  // Updated for Universal Knex Wrapper migrations (v3.9.0)
  // All migrations now in single flat directory
  return [
    join(projectRoot, 'dist/database/migrations/v4'),
  ];
}

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize fresh database with all Knex migrations
 *
 * This creates a clean database state by:
 * 1. Connecting to the database
 * 2. Running all migrations (bootstrap + upgrades + enhancements)
 * 3. Verifying migration success
 *
 * @param dbType - Database type (mysql, mariadb, postgresql)
 * @returns Knex instance connected to fresh database
 *
 * @throws Error if connection fails or migrations fail
 *
 * @example
 * ```typescript
 * const db = await initDatabase('postgresql');
 * // ... run tests ...
 * await teardownDatabase(db);
 * ```
 */
export async function initDatabase(dbType: DatabaseType): Promise<Knex> {
  // Get base configuration from centralized testing config
  const config = getTestConfig(dbType);

  // Add migration configuration
  const migrationDirs = getMigrationDirs();
  const fullConfig: Knex.Config = {
    ...config,
    migrations: {
      directory: migrationDirs,
      extension: 'js',
      tableName: 'knex_migrations',
      loadExtensions: ['.js'],
    },
  };

  // Create connection
  const db = knex(fullConfig);

  try {
    // Verify connection
    await db.raw('SELECT 1');

    // Run all migrations
    const [batchNo, migrations] = await db.migrate.latest();

    if (migrations.length === 0) {
      console.log(`    ℹ️  Database already migrated (batch ${batchNo})`);
    } else {
      console.log(`    ✅ Ran ${migrations.length} migrations (batch ${batchNo})`);
    }

    // Verify migrations completed
    await verifyMigrations(db);

    return db;
  } catch (error: any) {
    // Cleanup on failure
    await db.destroy().catch(() => {});
    throw new Error(`Failed to initialize ${dbType} database: ${error.message}`);
  }
}

/**
 * Verify that migrations completed successfully
 *
 * Checks:
 * - knex_migrations table exists
 * - At least one migration ran
 * - Key tables exist (v4_agents, v4_decisions, v4_tasks)
 *
 * @param db - Knex database connection
 * @throws Error if verification fails
 */
export async function verifyMigrations(db: Knex): Promise<void> {
  // Check migration table exists
  const hasMigrationTable = await db.schema.hasTable('knex_migrations');
  assert.ok(hasMigrationTable, 'knex_migrations table should exist');

  // Check migrations ran
  const migrations = await db('knex_migrations').select('name');
  assert.ok(migrations.length > 0, 'At least one migration should have run');

  // Check key tables exist
  const keyTables = ['v4_agents', 'v4_context_keys', 'v4_decisions', 'v4_tasks', 'v4_constraints'];
  for (const table of keyTables) {
    const exists = await db.schema.hasTable(table);
    assert.ok(exists, `Table ${table} should exist after migrations`);
  }
}

// ============================================================================
// Database Teardown
// ============================================================================

/**
 * Clean up database and disconnect
 *
 * Performs proper cleanup:
 * 1. Drop all tables (including knex_migrations)
 * 2. Disconnect from database
 *
 * Note: This is safe because tests use Docker containers with isolated databases.
 *
 * @param db - Knex database connection
 */
export async function teardownDatabase(db: Knex): Promise<void> {
  try {
    // Get database type from client config
    const client = db.client.config.client;
    const dbType = getDbTypeFromClient(client);

    // Drop all tables (including knex_migrations)
    await dropAllTables(db, dbType);

    // Disconnect
    await db.destroy();
  } catch (error) {
    // Best effort cleanup - ignore errors
    await db.destroy().catch(() => {});
  }
}

/**
 * Drop all tables from database
 *
 * Database-specific DROP TABLE implementations to handle different SQL dialects.
 *
 * @param db - Knex database connection
 * @param dbType - Database type
 */
async function dropAllTables(db: Knex, dbType: DatabaseType): Promise<void> {
  if (dbType === 'mysql' || dbType === 'mariadb') {
    // MySQL/MariaDB: Disable FK checks, drop all tables
    await db.raw('SET FOREIGN_KEY_CHECKS=0');

    const tables = await db.raw(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
    `);

    for (const row of tables[0]) {
      await db.raw(`DROP TABLE IF EXISTS \`${row.TABLE_NAME}\``);
    }

    await db.raw('SET FOREIGN_KEY_CHECKS=1');
  } else if (dbType === 'postgresql') {
    // PostgreSQL: Drop all tables with CASCADE
    const tables = await db.raw(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);

    for (const row of tables.rows) {
      await db.raw(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
    }
  }
}

/**
 * Get DatabaseType from Knex client string
 *
 * @param client - Knex client string (e.g., 'mysql2', 'pg', 'better-sqlite3')
 * @returns DatabaseType
 */
function getDbTypeFromClient(client: string): DatabaseType {
  switch (client) {
    case 'mysql2':
      // Cannot distinguish MySQL from MariaDB via client, default to mysql
      return 'mysql';
    case 'pg':
      return 'postgresql';
    case 'better-sqlite3':
    case 'sqlite3':
      return 'sqlite';
    default:
      throw new Error(`Unknown client type: ${client}`);
  }
}
