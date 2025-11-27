/**
 * Automated Cross-Database SQL Dump Export/Import Tests
 *
 * Tests complete export/import workflow:
 * SQLite → MySQL/MariaDB/PostgreSQL
 *
 * Verifies:
 * - SQL dump generation
 * - Import into Docker containers
 * - Schema integrity (table counts, row counts)
 * - Constraint preservation (FK, UNIQUE, PRIMARY KEY)
 * - Data type conversions (TEXT→VARCHAR, boolean, datetime)
 *
 * Prerequisites:
 * - Docker containers running (MySQL, MariaDB, PostgreSQL)
 * - Run: docker-compose -f docker/docker-compose.yml up -d
 *
 * Skip in CI: Set SKIP_DOCKER_TESTS=true or CI=true
 */

// Skip Docker-dependent tests in CI environments
if (process.env.SKIP_DOCKER_TESTS === 'true' || process.env.CI === 'true') {
  console.log('⏭️  Skipping Docker-dependent cross-database tests (CI environment)');
  process.exit(0);
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { generateSqlDump } from '../../utils/sql-dump/index.js';
import {
  getDbConfig,
  connectDb,
  disconnectDb,
  dropAllTables,
  getTables,
  assertTableCountsMatch,
  assertRowCountsMatch,
  getFKConstraints,
  seedTestData,
  assertSeededDataExists,
  importSqlToDocker,
  type DatabaseType,
} from '../utils/test-helpers.js';
import type { Knex } from 'knex';
import { join } from 'node:path';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';

const testDbPath = join(process.cwd(), '.sqlew/test-cross-db.db');

describe('Cross-Database SQL Dump Export/Import', () => {
  let sqliteDb: Knex;
  let mysqlDb: Knex;
  let mariaDb: Knex;
  let postgresDb: Knex;

  let mysqlDump: string;
  let mariaDbDump: string;
  let postgresDump: string;

  before(async () => {
    console.log('  📦 Setting up cross-database test environment...');

    // Ensure test directory exists
    const testDir = join(process.cwd(), '.sqlew');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Remove existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    // Connect to all databases
    const sqliteConfig = getDbConfig('sqlite', testDbPath);
    const mysqlConfig = getDbConfig('mysql');
    const mariaConfig = getDbConfig('mariadb');
    const postgresConfig = getDbConfig('postgresql');

    sqliteDb = await connectDb(sqliteConfig);
    mysqlDb = await connectDb(mysqlConfig);
    mariaDb = await connectDb(mariaConfig);
    postgresDb = await connectDb(postgresConfig);

    console.log('  ✅ All databases connected');

    // Run migrations on SQLite to create full schema
    console.log('  🏗️  Running migrations on SQLite...');
    await sqliteDb.migrate.latest();
    console.log('  ✅ Migrations complete');

    // Seed test data
    console.log('  🌱 Seeding test data...');
    await seedTestData(sqliteDb);
    await assertSeededDataExists(sqliteDb);
    console.log('  ✅ Test data seeded');
  });

  after(async () => {
    if (sqliteDb) await disconnectDb(sqliteDb);
    if (mysqlDb) await disconnectDb(mysqlDb);
    if (mariaDb) await disconnectDb(mariaDb);
    if (postgresDb) await disconnectDb(postgresDb);

    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  // ==========================================================================
  // MySQL Export/Import Tests
  // ==========================================================================

  describe('MySQL Export/Import', () => {
    it('should export SQLite to MySQL format', async () => {
      console.log('    📤 Exporting SQLite → MySQL...');

      // Get non-view tables only (views contain SQLite-specific functions like unixepoch())
      const tables = await sqliteDb.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
        ORDER BY name
      `);
      const tableNames = tables.map((r: any) => r.name);

      mysqlDump = await generateSqlDump(sqliteDb, 'mysql', {
        tables: tableNames,
        includeSchema: true,
        includeHeader: true,
        chunkSize: 100,
      });

      assert.ok(mysqlDump.length > 0, 'MySQL dump should not be empty');
      assert.ok(mysqlDump.includes('CREATE TABLE'), 'Should contain CREATE TABLE');
      assert.ok(mysqlDump.includes('PRIMARY KEY'), 'Should contain PRIMARY KEY');

      console.log(`      ✅ Generated ${mysqlDump.length} characters`);
    });

    it('should not have TEXT in PRIMARY KEY/UNIQUE constraints (MySQL dump)', () => {
      console.log('    🔍 Checking for TEXT in constraints (MySQL dump)...');

      // Check v4_help_use_case_categories.category_name TEXT UNIQUE → VARCHAR(191) UNIQUE
      const categoriesMatch = mysqlDump.match(/CREATE TABLE.*?v4_help_use_case_categories.*?\(.*?\)/s);
      if (categoriesMatch) {
        assert.ok(!categoriesMatch[0].includes('category_name TEXT UNIQUE'), 'category_name should not be TEXT UNIQUE');
      }

      console.log('      ✅ No TEXT in constraints (dump verified)');
    });

    it('should import SQL dump into MySQL', async () => {
      console.log('    📥 Importing into MySQL...');

      // Drop all tables
      await dropAllTables(mysqlDb, 'mysql');

      // Import SQL via Docker
      const config = getDbConfig('mysql');
      await importSqlToDocker(mysqlDump, config.containerName!, 'mysql');

      console.log('      ✅ Import successful');
    });

    it('should verify table counts match (MySQL)', async () => {
      console.log('    🔢 Verifying table counts...');
      await assertTableCountsMatch(sqliteDb, 'sqlite', mysqlDb, 'mysql');
      console.log('      ✅ Table counts match');
    });

    it('should verify row counts match (MySQL)', async () => {
      console.log('    📊 Verifying row counts...');

      const tables = await getTables(sqliteDb, 'sqlite');

      for (const table of tables) {
        await assertRowCountsMatch(sqliteDb, mysqlDb, table);
      }

      console.log(`      ✅ Row counts match (${tables.length} tables)`);
    });

    it('should verify no TEXT in PRIMARY KEY/UNIQUE/FK (MySQL database)', async () => {
      console.log('    🔍 Checking for TEXT in constraints (MySQL database)...');

      const textInConstraints = await mysqlDb.raw(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY, TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'mcp_test'
          AND DATA_TYPE = 'text'
          AND COLUMN_KEY IN ('PRI', 'UNI')
      `);

      const badColumns = textInConstraints[0];
      if (badColumns.length > 0) {
        console.error('      ❌ Found TEXT columns in constraints:', badColumns);
      }

      assert.strictEqual(badColumns.length, 0, 'TEXT columns should not be in PRIMARY KEY/UNIQUE constraints');

      console.log('      ✅ No TEXT in constraints (database verified)');
    });

    it('should verify FK constraints exist (MySQL)', async () => {
      console.log('    🔗 Verifying FK constraints...');

      const fks = await getFKConstraints(mysqlDb, 'mysql', 'v4_decisions');
      assert.ok(fks.length > 0, 'Should have FK constraints on v4_decisions');

      console.log(`      ✅ Found ${fks.length} FK constraints`);
    });

    it('should enforce FK constraints (MySQL)', async () => {
      console.log('    🧪 Testing FK constraint enforcement...');

      try {
        await mysqlDb('v4_decisions').insert({
          key_id: 9999, // Non-existent key
          project_id: 1,
          value: 'test',
          ts: Math.floor(Date.now() / 1000),
          layer_id: 1,
        });

        assert.fail('MySQL should reject invalid FK reference');
      } catch (error: any) {
        const isValidError = error.message.includes('foreign key') ||
                            error.code === 'ER_NO_REFERENCED_ROW_2' ||
                            error.message.includes('FOREIGN KEY');

        assert.ok(isValidError, `Should throw FK constraint error, got: ${error.message}`);
        console.log('      ✅ FK constraints enforced correctly');
      }
    });
  });

  // ==========================================================================
  // MariaDB Export/Import Tests
  // ==========================================================================

  describe('MariaDB Export/Import', () => {
    it('should export SQLite to MariaDB format', async () => {
      console.log('    📤 Exporting SQLite → MariaDB...');

      // Get non-view tables only (same as MySQL test)
      const tables = await sqliteDb.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
        ORDER BY name
      `);
      const tableNames = tables.map((r: any) => r.name);

      // MariaDB uses MySQL dialect
      mariaDbDump = await generateSqlDump(sqliteDb, 'mysql', {
        tables: tableNames,
        includeSchema: true,
        includeHeader: true,
        chunkSize: 100,
      });

      assert.ok(mariaDbDump.length > 0, 'MariaDB dump should not be empty');
      console.log(`      ✅ Generated ${mariaDbDump.length} characters`);
    });

    it('should import SQL dump into MariaDB', async () => {
      console.log('    📥 Importing into MariaDB...');

      await dropAllTables(mariaDb, 'mariadb');

      const config = getDbConfig('mariadb');
      await importSqlToDocker(mariaDbDump, config.containerName!, 'mariadb');

      console.log('      ✅ Import successful');
    });

    it('should verify table counts match (MariaDB)', async () => {
      console.log('    🔢 Verifying table counts...');
      await assertTableCountsMatch(sqliteDb, 'sqlite', mariaDb, 'mariadb');
      console.log('      ✅ Table counts match');
    });

    it('should verify row counts match (MariaDB)', async () => {
      console.log('    📊 Verifying row counts...');

      const tables = await getTables(sqliteDb, 'sqlite');

      for (const table of tables) {
        await assertRowCountsMatch(sqliteDb, mariaDb, table);
      }

      console.log(`      ✅ Row counts match (${tables.length} tables)`);
    });

    it('should verify no TEXT in PRIMARY KEY/UNIQUE/FK (MariaDB)', async () => {
      console.log('    🔍 Checking for TEXT in constraints (MariaDB)...');

      const textInConstraints = await mariaDb.raw(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY, TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'mcp_test'
          AND DATA_TYPE = 'text'
          AND COLUMN_KEY IN ('PRI', 'UNI')
      `);

      const badColumns = textInConstraints[0];
      assert.strictEqual(badColumns.length, 0, 'TEXT columns should not be in PRIMARY KEY/UNIQUE constraints (MariaDB 10.5 compatibility)');

      console.log('      ✅ No TEXT in constraints (MariaDB verified)');
    });

    it('should verify FK constraints exist (MariaDB)', async () => {
      console.log('    🔗 Verifying FK constraints...');

      const fks = await getFKConstraints(mariaDb, 'mariadb', 'v4_decisions');
      assert.ok(fks.length > 0, 'Should have FK constraints on v4_decisions');

      console.log(`      ✅ Found ${fks.length} FK constraints`);
    });
  });

  // ==========================================================================
  // PostgreSQL Export/Import Tests
  // ==========================================================================

  describe('PostgreSQL Export/Import', () => {
    it('should export SQLite to PostgreSQL format', async () => {
      console.log('    📤 Exporting SQLite → PostgreSQL...');

      // Get non-view tables only (views contain SQLite-specific functions)
      const tables = await sqliteDb.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
        ORDER BY name
      `);
      const tableNames = tables.map((r: any) => r.name);

      postgresDump = await generateSqlDump(sqliteDb, 'postgresql', {
        tables: tableNames,
        includeSchema: true,
        includeHeader: true,
        chunkSize: 100,
      });

      assert.ok(postgresDump.length > 0, 'PostgreSQL dump should not be empty');
      assert.ok(postgresDump.includes('CREATE TABLE'), 'Should contain CREATE TABLE');

      console.log(`      ✅ Generated ${postgresDump.length} characters`);
    });

    it('should import SQL dump into PostgreSQL', async () => {
      console.log('    📥 Importing into PostgreSQL...');

      await dropAllTables(postgresDb, 'postgresql');

      const config = getDbConfig('postgresql');
      await importSqlToDocker(postgresDump, config.containerName!, 'postgresql');

      console.log('      ✅ Import successful');
    });

    it('should verify table counts match (PostgreSQL)', async () => {
      console.log('    🔢 Verifying table counts...');
      await assertTableCountsMatch(sqliteDb, 'sqlite', postgresDb, 'postgresql');
      console.log('      ✅ Table counts match');
    });

    it('should verify row counts match (PostgreSQL)', async () => {
      console.log('    📊 Verifying row counts...');

      const tables = await getTables(sqliteDb, 'sqlite');

      for (const table of tables) {
        await assertRowCountsMatch(sqliteDb, postgresDb, table);
      }

      console.log(`      ✅ Row counts match (${tables.length} tables)`);
    });

    it('should verify FK constraints exist (PostgreSQL)', async () => {
      console.log('    🔗 Verifying FK constraints...');

      const fks = await getFKConstraints(postgresDb, 'postgresql', 'v4_decisions');
      assert.ok(fks.length > 0, 'Should have FK constraints on v4_decisions');

      console.log(`      ✅ Found ${fks.length} FK constraints`);
    });

    it('should convert booleans to TRUE/FALSE (PostgreSQL)', async () => {
      console.log('    🔄 Verifying boolean conversion...');

      const result = await postgresDb('v4_constraints').select('active').first();

      if (result) {
        // PostgreSQL should return actual boolean, not 0/1
        assert.strictEqual(typeof result.active, 'boolean', 'active should be boolean type');
        console.log('      ✅ Boolean values converted correctly');
      } else {
        console.log('      ⚠️  No data to verify boolean conversion');
      }
    });
  });
});
