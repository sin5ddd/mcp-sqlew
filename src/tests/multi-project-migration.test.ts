/**
 * Multi-Project Schema Migration Tests (v3.7.0)
 *
 * Tests comprehensive cross-database migration following user requirements:
 * 1. Initialize SQLite, MySQL, MariaDB, PostgreSQL with migrations
 * 2. Seed each database with multi-project test data
 * 3. Export each database using sql-dump
 * 4. Drop all schemas
 * 5. Test whether dump SQL can be imported to all databases
 *
 * Uses DRY shared test utilities from test-helpers.ts
 *
 * NOTE: These tests require Docker containers (MySQL, MariaDB, PostgreSQL)
 * Set SKIP_DOCKER_TESTS=true or CI=true to skip in CI environments
 */

// Skip Docker-dependent tests in CI environments
if (process.env.SKIP_DOCKER_TESTS === 'true' || process.env.CI === 'true') {
  console.log('⏭️  Skipping Docker-dependent multi-project migration tests (CI environment)');
  process.exit(0);
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { generateSqlDump } from '../utils/sql-dump.js';
import {
  getDbConfig,
  connectDb,
  disconnectDb,
  dropAllTables,
  getTables,
  getTableInfo,
  assertTableCountsMatch,
  assertRowCountsMatch,
  getFKConstraints,
  assertFKConstraintsExist,
  seedTestData,
  assertSeededDataExists,
  importSqlToDocker,
  type DatabaseType,
} from './utils/test-helpers.js';
import type { Knex } from 'knex';
import { join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';

// Test database path
const testDbPath = join(process.cwd(), '.sqlew/test-multi-project.db');

describe('Multi-Project Schema Migration Tests (v3.7.0)', () => {
  let sqliteDb: Knex;
  let mysqlDb: Knex;
  let mariadbDb: Knex;
  let postgresDb: Knex;

  before(async () => {
    console.log('  📦 Setting up test databases...');

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
    const mariadbConfig = getDbConfig('mariadb');
    const postgresConfig = getDbConfig('postgresql');

    sqliteDb = await connectDb(sqliteConfig);
    mysqlDb = await connectDb(mysqlConfig);
    mariadbDb = await connectDb(mariadbConfig);
    postgresDb = await connectDb(postgresConfig);

    console.log('  ✅ All databases connected');
  });

  after(async () => {
    if (sqliteDb) await disconnectDb(sqliteDb);
    if (mysqlDb) await disconnectDb(mysqlDb);
    if (mariadbDb) await disconnectDb(mariadbDb);
    if (postgresDb) await disconnectDb(postgresDb);

    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  // ========================================================================
  // REQUIREMENT 1: Initialize databases with migrations
  // ========================================================================

  describe('Requirement 1: Initialize databases with migrations', () => {
    it('should initialize SQLite with migrations', async () => {
      console.log('    🔄 Running SQLite migrations...');

      const [batchNo, log] = await sqliteDb.migrate.latest();
      console.log(`      ✅ Migrations completed (batch ${batchNo}, ${log.length} migrations)`);

      // Verify multi-project tables exist
      const hasMProjects = await sqliteDb.schema.hasTable('m_projects');
      const hasTDecisions = await sqliteDb.schema.hasTable('t_decisions');
      const hasTTasks = await sqliteDb.schema.hasTable('t_tasks');

      assert.ok(hasMProjects, 'Should have m_projects table');
      assert.ok(hasTDecisions, 'Should have t_decisions table');
      assert.ok(hasTTasks, 'Should have t_tasks table');

      // Verify project_id columns exist
      const hasProjectIdInDecisions = await sqliteDb.schema.hasColumn('t_decisions', 'project_id');
      const hasProjectIdInTasks = await sqliteDb.schema.hasColumn('t_tasks', 'project_id');

      assert.ok(hasProjectIdInDecisions, 't_decisions should have project_id');
      assert.ok(hasProjectIdInTasks, 't_tasks should have project_id');

      console.log('      ✅ Multi-project schema verified');
    });
  });

  // ========================================================================
  // REQUIREMENT 2: Seed each database with test data
  // ========================================================================

  describe('Requirement 2: Seed with multi-project test data', () => {
    it('should seed SQLite with multi-project data', async () => {
      console.log('    🌱 Seeding SQLite with test data...');

      await seedTestData(sqliteDb);
      await assertSeededDataExists(sqliteDb);

      // Verify multi-project isolation
      const projects = await sqliteDb('m_projects').select();
      assert.strictEqual(projects.length, 2, 'Should have 2 projects');

      const decisions = await sqliteDb('t_decisions').select();
      assert.strictEqual(decisions.length, 2, 'Should have 2 decisions');

      // Verify decisions are in different projects
      const project1Decisions = decisions.filter(d => d.project_id === 10);
      const project2Decisions = decisions.filter(d => d.project_id === 20);

      assert.strictEqual(project1Decisions.length, 1, 'Project 10 should have 1 decision');
      assert.strictEqual(project2Decisions.length, 1, 'Project 20 should have 1 decision');

      console.log('      ✅ Multi-project data seeded and verified');
    });
  });

  // ========================================================================
  // REQUIREMENT 3: Export each database using sql-dump
  // ========================================================================

  describe('Requirement 3: Export databases using sql-dump', () => {
    it('should export SQLite to MySQL format', async () => {
      console.log('    📤 Exporting SQLite → MySQL...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeHeader: true,
        includeSchema: true,
        chunkSize: 100,
      });

      // Verify dump contains schema and data
      assert.ok(dump.includes('CREATE TABLE'), 'Should contain CREATE TABLE statements');
      assert.ok(dump.includes('INSERT INTO'), 'Should contain INSERT statements');
      assert.ok(dump.includes('m_projects'), 'Should include m_projects table');
      assert.ok(dump.includes('t_decisions'), 'Should include t_decisions table');

      console.log(`      ✅ MySQL dump generated (${dump.length} chars)`);
    });

    it('should export SQLite to PostgreSQL format', async () => {
      console.log('    📤 Exporting SQLite → PostgreSQL...');

      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        includeHeader: true,
        includeSchema: true,
        chunkSize: 100,
      });

      // Verify PostgreSQL-specific syntax
      assert.ok(dump.includes('CREATE TABLE'), 'Should contain CREATE TABLE statements');
      assert.ok(dump.includes('INSERT INTO'), 'Should contain INSERT statements');
      assert.ok(dump.includes('SERIAL') || dump.includes('PRIMARY KEY'), 'Should use PostgreSQL syntax');

      console.log(`      ✅ PostgreSQL dump generated (${dump.length} chars)`);
    });
  });

  // ========================================================================
  // REQUIREMENT 4: Drop all schemas
  // ========================================================================

  describe('Requirement 4: Drop all schemas from databases', () => {
    it('should drop all tables from MySQL', async () => {
      console.log('    🗑️  Dropping MySQL tables...');

      await dropAllTables(mysqlDb, 'mysql');

      const tables = await getTables(mysqlDb, 'mysql');
      assert.strictEqual(tables.length, 0, 'MySQL should have no tables');

      console.log('      ✅ MySQL tables dropped');
    });

    it('should drop all tables from MariaDB', async () => {
      console.log('    🗑️  Dropping MariaDB tables...');

      await dropAllTables(mariadbDb, 'mariadb');

      const tables = await getTables(mariadbDb, 'mariadb');
      assert.strictEqual(tables.length, 0, 'MariaDB should have no tables');

      console.log('      ✅ MariaDB tables dropped');
    });

    it('should drop all tables from PostgreSQL', async () => {
      console.log('    🗑️  Dropping PostgreSQL tables...');

      await dropAllTables(postgresDb, 'postgresql');

      const tables = await getTables(postgresDb, 'postgresql');
      assert.strictEqual(tables.length, 0, 'PostgreSQL should have no tables');

      console.log('      ✅ PostgreSQL tables dropped');
    });
  });

  // ========================================================================
  // REQUIREMENT 5: Test whether dump SQL can be imported
  // ========================================================================

  describe('Requirement 5: Import dump SQL to all databases', () => {
    it('should import SQLite dump to MySQL', async () => {
      console.log('    📥 Importing SQLite dump → MySQL...');

      // Generate dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Import via Docker
      const config = getDbConfig('mysql');
      await importSqlToDocker(dump, config.containerName!, 'mysql');

      console.log('      ✅ Import completed');

      // Verify tables exist
      await assertTableCountsMatch(sqliteDb, 'sqlite', mysqlDb, 'mysql');

      // Verify multi-project tables
      const hasProjects = await mysqlDb.schema.hasTable('m_projects');
      const hasDecisions = await mysqlDb.schema.hasTable('t_decisions');

      assert.ok(hasProjects, 'MySQL should have m_projects table');
      assert.ok(hasDecisions, 'MySQL should have t_decisions table');

      // Verify data
      await assertRowCountsMatch(sqliteDb, mysqlDb, 'm_projects');
      await assertRowCountsMatch(sqliteDb, mysqlDb, 't_decisions');

      console.log('      ✅ MySQL data verified');
    });

    it('should import SQLite dump to MariaDB', async () => {
      console.log('    📥 Importing SQLite dump → MariaDB...');

      // Generate dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Import via Docker
      const config = getDbConfig('mariadb');
      await importSqlToDocker(dump, config.containerName!, 'mariadb');

      console.log('      ✅ Import completed');

      // Verify tables exist
      await assertTableCountsMatch(sqliteDb, 'sqlite', mariadbDb, 'mariadb');

      // Verify data
      await assertRowCountsMatch(sqliteDb, mariadbDb, 'm_projects');
      await assertRowCountsMatch(sqliteDb, mariadbDb, 't_decisions');

      console.log('      ✅ MariaDB data verified');
    });

    it('should import SQLite dump to PostgreSQL', async () => {
      console.log('    📥 Importing SQLite dump → PostgreSQL...');

      // Generate dump
      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Import via Docker
      const config = getDbConfig('postgresql');
      await importSqlToDocker(dump, config.containerName!, 'postgresql');

      console.log('      ✅ Import completed');

      // Verify tables exist
      await assertTableCountsMatch(sqliteDb, 'sqlite', postgresDb, 'postgresql');

      // Verify data
      await assertRowCountsMatch(sqliteDb, postgresDb, 'm_projects');
      await assertRowCountsMatch(sqliteDb, postgresDb, 't_decisions');

      console.log('      ✅ PostgreSQL data verified');
    });
  });

  // ========================================================================
  // BONUS: Verify multi-project schema integrity
  // ========================================================================

  describe('Bonus: Verify multi-project schema integrity', () => {
    it('should verify composite PRIMARY KEY on MySQL', async () => {
      console.log('    🔍 Verifying MySQL composite PRIMARY KEY...');

      const pkQuery = await mysqlDb.raw(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'mcp_test'
          AND TABLE_NAME = 't_decisions'
          AND COLUMN_KEY = 'PRI'
        ORDER BY ORDINAL_POSITION
      `);

      const pkColumns = pkQuery[0].map((r: any) => r.COLUMN_NAME);
      assert.deepStrictEqual(pkColumns, ['key_id', 'project_id'], 'Should have composite PK (key_id, project_id)');

      console.log('      ✅ MySQL composite PK verified');
    });

    it('should verify composite PRIMARY KEY on PostgreSQL', async () => {
      console.log('    🔍 Verifying PostgreSQL composite PRIMARY KEY...');

      const pkQuery = await postgresDb.raw(`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 't_decisions'::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
      `);

      const pkColumns = pkQuery.rows.map((r: any) => r.attname);
      assert.deepStrictEqual(pkColumns, ['key_id', 'project_id'], 'Should have composite PK (key_id, project_id)');

      console.log('      ✅ PostgreSQL composite PK verified');
    });

    it('should verify FK constraints preserved on MySQL', async () => {
      console.log('    🔍 Verifying MySQL FK constraints...');

      // t_decisions should have FK to m_projects
      await assertFKConstraintsExist(mysqlDb, 'mysql', 't_decisions', 1);

      // t_tasks should have FK to m_projects
      await assertFKConstraintsExist(mysqlDb, 'mysql', 't_tasks', 1);

      console.log('      ✅ MySQL FK constraints verified');
    });

    it('should verify FK constraints preserved on PostgreSQL', async () => {
      console.log('    🔍 Verifying PostgreSQL FK constraints...');

      // t_decisions should have FK to m_projects
      await assertFKConstraintsExist(postgresDb, 'postgresql', 't_decisions', 1);

      // t_tasks should have FK to m_projects
      await assertFKConstraintsExist(postgresDb, 'postgresql', 't_tasks', 1);

      console.log('      ✅ PostgreSQL FK constraints verified');
    });

    it('should verify multi-project data isolation', async () => {
      console.log('    🔍 Verifying multi-project data isolation...');

      // MySQL: Verify data is properly isolated by project_id
      const mysqlDecisions = await mysqlDb('t_decisions').select();
      const mysqlProjects = mysqlDecisions.map(d => d.project_id).sort((a, b) => a - b);

      assert.deepStrictEqual(mysqlProjects, [10, 20], 'MySQL should have decisions in projects 10 and 20');

      // PostgreSQL: Verify same isolation
      const pgDecisions = await postgresDb('t_decisions').select();
      const pgProjects = pgDecisions.map(d => d.project_id).sort((a, b) => a - b);

      assert.deepStrictEqual(pgProjects, [10, 20], 'PostgreSQL should have decisions in projects 10 and 20');

      console.log('      ✅ Multi-project isolation verified');
    });
  });

  // ========================================================================
  // VALIDATION: Detect TEXT PRIMARY KEY and nullable composite PK errors
  // ========================================================================

  describe('Schema Validation: TEXT PRIMARY KEY and nullable composite PK', () => {
    it('should validate no TEXT columns used as PRIMARY KEY in MySQL dump', async () => {
      console.log('    🔍 Validating MySQL dump for TEXT PRIMARY KEY errors...');

      // Generate MySQL dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Check for TEXT PRIMARY KEY pattern (MariaDB 10.5 incompatible)
      const textPrimaryKeyPattern = /\bTEXT\s+PRIMARY\s+KEY/gi;
      const matches = dump.match(textPrimaryKeyPattern);

      if (matches) {
        console.log(`      ❌ Found ${matches.length} TEXT PRIMARY KEY instances (MariaDB 10.5 incompatible):`);
        const lines = dump.split('\n');
        lines.forEach((line, idx) => {
          if (textPrimaryKeyPattern.test(line)) {
            console.log(`        Line ${idx + 1}: ${line.trim()}`);
          }
        });
      }

      assert.strictEqual(matches, null, 'MySQL dump should not contain TEXT PRIMARY KEY (MariaDB 10.5 incompatible)');
      console.log('      ✅ No TEXT PRIMARY KEY found in MySQL dump');
    });

    it('should validate no nullable columns in composite PRIMARY KEY in MySQL dump', async () => {
      console.log('    🔍 Validating MySQL dump for nullable composite PRIMARY KEY errors...');

      // Generate MySQL dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Extract CREATE TABLE statements
      const createTableRegex = /CREATE TABLE[^;]+;/gi;
      const createStatements = dump.match(createTableRegex) || [];

      const errors: string[] = [];

      for (const stmt of createStatements) {
        // Check if statement has composite PRIMARY KEY
        const compositePkMatch = stmt.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (!compositePkMatch) continue;

        const pkColumns = compositePkMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, ''));
        if (pkColumns.length < 2) continue; // Not a composite PK

        // Extract table name
        const tableNameMatch = stmt.match(/CREATE TABLE\s+[`"]?(\w+)[`"]?/i);
        const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';

        // Check if any PK column is nullable
        for (const col of pkColumns) {
          // Pattern: column_name type NULL or column_name type (without NOT NULL)
          const colDefPattern = new RegExp(`[(\`"]?${col}[)\`"]?\\s+\\w+(?:\\(\\d+\\))?\\s+(?!NOT\\s+NULL)`, 'i');
          if (colDefPattern.test(stmt) && /\s+NULL\s+/i.test(stmt)) {
            errors.push(`Table ${tableName}: Composite PRIMARY KEY column '${col}' appears nullable`);
          }
        }
      }

      if (errors.length > 0) {
        console.log(`      ❌ Found ${errors.length} nullable composite PRIMARY KEY errors:`);
        errors.forEach(err => console.log(`        - ${err}`));
        assert.fail(`Found nullable columns in composite PRIMARY KEY: ${errors.join('; ')}`);
      }

      console.log('      ✅ No nullable composite PRIMARY KEY found in MySQL dump');
    });

    it('should validate m_config table uses single-column PRIMARY KEY', async () => {
      console.log('    🔍 Validating m_config PRIMARY KEY structure...');

      // Generate MySQL dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Find m_config CREATE TABLE statement
      const configTableMatch = dump.match(/CREATE TABLE[^;]*m_config[^;]+;/i);
      assert.ok(configTableMatch, 'Should find m_config table in dump');

      const configStmt = configTableMatch[0];

      // Check for composite PRIMARY KEY (key, project_id) - WRONG
      const compositePkPattern = /PRIMARY\s+KEY\s*\(\s*[`"]?key[`"]?\s*,\s*[`"]?project_id[`"]?\s*\)/i;
      assert.ok(!compositePkPattern.test(configStmt), 'm_config should NOT have composite PRIMARY KEY (key, project_id)');

      // Check for single-column PRIMARY KEY on 'key' - CORRECT
      const singlePkPattern = /[`"]?key[`"]?[^,]*PRIMARY\s+KEY|PRIMARY\s+KEY\s*\(\s*[`"]?key[`"]?\s*\)/i;
      assert.ok(singlePkPattern.test(configStmt), 'm_config should have single-column PRIMARY KEY on key');

      console.log('      ✅ m_config correctly uses single-column PRIMARY KEY');
    });

    it('should validate m_help_tools.tool_name is VARCHAR not TEXT', async () => {
      console.log('    🔍 Validating m_help_tools.tool_name data type...');

      // Generate MySQL dump
      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Find m_help_tools CREATE TABLE statement
      const helpToolsMatch = dump.match(/CREATE TABLE[^;]*m_help_tools[^;]+;/i);
      assert.ok(helpToolsMatch, 'Should find m_help_tools table in dump');

      const helpToolsStmt = helpToolsMatch[0];

      // Check tool_name is VARCHAR, not TEXT
      const toolNamePattern = /tool_name\s+(VARCHAR|TEXT)/i;
      const match = helpToolsStmt.match(toolNamePattern);
      assert.ok(match, 'Should find tool_name column definition');
      assert.strictEqual(match[1].toUpperCase(), 'VARCHAR', 'tool_name should be VARCHAR not TEXT (MariaDB 10.5 compatibility)');

      console.log('      ✅ m_help_tools.tool_name correctly uses VARCHAR');
    });
  });
});
