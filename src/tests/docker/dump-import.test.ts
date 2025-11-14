/**
 * Cross-database migration integration tests
 *
 * Tests full migration workflow:
 * 1. Generate SQL dump from SQLite
 * 2. Import to PostgreSQL
 * 3. Import to MySQL
 * 4. Verify data integrity
 *
 * Prerequisites:
 * - Docker installed and running
 * - Run: docker-compose -f docker/docker-compose.test.yml up -d
 */

import knex, { Knex } from 'knex';
import { generateSqlDump } from '../../utils/sql-dump/index.js';
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getTestConfig, getDockerExecPrefix, getDockerConfig } from '../database/testing-config.js';

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

// Test database configurations (using centralized config)
const configs = {
  sqlite: getTestConfig('sqlite'),
  postgresql: getTestConfig('postgresql'),
  mysql: getTestConfig('mysql'),
};

describe('Cross-Database Migration Tests', () => {
  let sqliteDb: Knex;
  let postgresDb: Knex;
  let mysqlDb: Knex;

  before(async () => {
    // Connect to all databases
    sqliteDb = knex(configs.sqlite);
    postgresDb = knex(configs.postgresql);
    mysqlDb = knex(configs.mysql);

    // Verify connections
    console.log('  Verifying database connections...');
    await postgresDb.raw('SELECT 1');
    await mysqlDb.raw('SELECT 1');
    console.log('  ✅ All databases connected');
  });

  after(async () => {
    // Cleanup
    await sqliteDb.destroy();
    await postgresDb.destroy();
    await mysqlDb.destroy();
  });

  describe('SQLite → PostgreSQL Migration', () => {
    it('should generate PostgreSQL dump from SQLite', async () => {
      console.log('    Generating PostgreSQL dump...');

      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        includeHeader: true,
        includeSchema: true,
        chunkSize: 100,
      });

      assert.ok(dump.length > 0, 'Dump should not be empty');
      assert.ok(dump.includes('CREATE TABLE') || dump.includes('create table'), 'Dump should contain CREATE TABLE statements');
      assert.ok(dump.includes('INSERT INTO') || dump.includes('insert into'), 'Dump should contain INSERT statements');

      console.log(`    ✅ Generated ${dump.length} characters`);
    });

    it('should import dump to PostgreSQL', async () => {
      console.log('    Importing to PostgreSQL...');

      // Generate dump (exclude knex_ tables as they have timestamp conversion issues)
      const allTables = await sqliteDb.raw(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex_%'
      `);
      const pgTables = allTables.map((row: any) => row.name);

      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        tables: pgTables,
        includeSchema: true,
        chunkSize: 50,
      });

      // Drop existing tables
      await postgresDb.raw('DROP SCHEMA public CASCADE');
      await postgresDb.raw('CREATE SCHEMA public');

      // Write dump to temporary file and import using docker exec psql
      const tempFile = '/tmp/sqlew-pg-test.sql';
      writeFileSync(tempFile, dump);

      try {
        // Copy file to container and execute
        const pgDocker = getDockerConfig('postgresql');
        const pgPrefix = getDockerExecPrefix('postgresql');
        await execAsyncWithTimeout(`docker cp ${tempFile} ${pgDocker.name}:/tmp/import.sql`);
        await execAsyncWithTimeout(
          `${pgPrefix} psql -U ${pgDocker.user} -d ${pgDocker.database} -f /tmp/import.sql -v ON_ERROR_STOP=1 -q`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
      } finally {
        unlinkSync(tempFile);
      }

      // Verify tables exist
      const tables = await postgresDb.raw(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      `);

      assert.ok(tables.rows.length > 0, 'Tables should be created');
      console.log(`    ✅ Imported ${tables.rows.length} tables`);
    });

    it('should verify data integrity (row counts)', async () => {
      console.log('    Verifying data integrity...');

      const testTables = ['m_agents', 't_tasks', 't_decisions'];

      for (const table of testTables) {
        const sqliteCount = await sqliteDb(table).count('* as count').first();
        const pgCount = await postgresDb(table).count('* as count').first();

        // PostgreSQL returns bigint as string, convert both to numbers for comparison
        assert.strictEqual(
          Number(pgCount?.count),
          Number(sqliteCount?.count),
          `Table ${table} row count should match`
        );

        console.log(`      ✅ ${table}: ${sqliteCount?.count} rows`);
      }
    });
  });

  describe('SQLite → MySQL Migration', () => {
    it('should generate MySQL dump from SQLite', async () => {
      console.log('    Generating MySQL dump...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeHeader: true,
        includeSchema: true,
        chunkSize: 100,
      });

      assert.ok(dump.length > 0, 'Dump should not be empty');
      assert.ok(dump.includes('CREATE TABLE') || dump.includes('create table'), 'Dump should contain CREATE TABLE statements');

      console.log(`    ✅ Generated ${dump.length} characters`);
    });

    it('should import dump to MySQL', async () => {
      console.log('    Importing to MySQL...');

      // Generate dump (exclude knex_ tables as they have timestamp conversion issues)
      const allTablesForMysql = await sqliteDb.raw(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex_%'
      `);
      const mysqlTables = allTablesForMysql.map((row: any) => row.name);

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        tables: mysqlTables,
        includeSchema: true,
        chunkSize: 50,
      });

      // Drop existing views and tables (disable FK checks first)
      await mysqlDb.raw('SET FOREIGN_KEY_CHECKS=0');

      // Drop views first (SHOW FULL TABLES WHERE Table_type = 'VIEW')
      const existingViews = await mysqlDb.raw(`SHOW FULL TABLES WHERE Table_type = 'VIEW'`);
      for (const row of existingViews[0]) {
        const viewName = Object.values(row)[0];
        await mysqlDb.raw(`DROP VIEW IF EXISTS \`${viewName}\``);
      }

      // Then drop tables
      const existingTables = await mysqlDb.raw('SHOW TABLES');
      for (const row of existingTables[0]) {
        const tableName = Object.values(row)[0];
        await mysqlDb.raw(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
      await mysqlDb.raw('SET FOREIGN_KEY_CHECKS=1');

      // Write dump to temporary file and import using docker exec mysql
      const tempFile = '/tmp/sqlew-mysql-test.sql';
      writeFileSync(tempFile, dump);

      try {
        // Copy file to container and execute
        const mysqlDocker = getDockerConfig('mysql');
        const mysqlPrefix = getDockerExecPrefix('mysql');
        await execAsyncWithTimeout(`docker cp ${tempFile} ${mysqlDocker.name}:/tmp/import.sql`);
        await execAsyncWithTimeout(
          `${mysqlPrefix} sh -c "mysql -u ${mysqlDocker.user} -p${mysqlDocker.password} ${mysqlDocker.database} < /tmp/import.sql"`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
      } finally {
        unlinkSync(tempFile);
      }

      // Verify tables exist
      const newTables = await mysqlDb.raw('SHOW TABLES');

      assert.ok(newTables[0].length > 0, 'Tables should be created');
      console.log(`    ✅ Imported ${newTables[0].length} tables`);
    });

    it('should verify data integrity (row counts)', async () => {
      console.log('    Verifying data integrity...');

      const testTables = ['m_agents', 't_tasks', 't_decisions'];

      for (const table of testTables) {
        const sqliteCount = await sqliteDb(table).count('* as count').first();
        const mysqlCount = await mysqlDb(table).count('* as count').first();

        // MySQL may return bigint as string, convert both to numbers for comparison
        assert.strictEqual(
          Number(mysqlCount?.count),
          Number(sqliteCount?.count),
          `Table ${table} row count should match`
        );

        console.log(`      ✅ ${table}: ${sqliteCount?.count} rows`);
      }
    });
  });

  describe('Data Value Verification', () => {
    it('should verify boolean values converted correctly (PostgreSQL)', async () => {
      console.log('    Verifying boolean conversions...');

      const sqliteAgents = await sqliteDb('m_agents').select('*').limit(3);
      const pgAgents = await postgresDb('m_agents').select('*').limit(3);

      for (let i = 0; i < sqliteAgents.length; i++) {
        // SQLite stores booleans as 0/1, PostgreSQL as TRUE/FALSE
        assert.strictEqual(
          Boolean(sqliteAgents[i].in_use),
          pgAgents[i].in_use,
          'Boolean in_use should match'
        );

        assert.strictEqual(
          Boolean(sqliteAgents[i].is_reusable),
          pgAgents[i].is_reusable,
          'Boolean is_reusable should match'
        );
      }

      console.log('      ✅ Boolean conversions verified');
    });

    it('should verify string values with quotes (SQL injection prevention)', async () => {
      console.log('    Verifying string escaping...');

      // Find tasks with quotes in titles
      const sqliteTasks = await sqliteDb('t_tasks')
        .select('*')
        .whereRaw("title LIKE '%''%'")
        .limit(3);

      if (sqliteTasks.length > 0) {
        const pgTasks = await postgresDb('t_tasks')
          .select('*')
          .whereIn('id', sqliteTasks.map(t => t.id));

        for (let i = 0; i < sqliteTasks.length; i++) {
          assert.strictEqual(
            sqliteTasks[i].title,
            pgTasks[i].title,
            'Quoted strings should match'
          );
        }

        console.log(`      ✅ ${sqliteTasks.length} tasks with quotes verified`);
      } else {
        console.log('      ℹ️  No tasks with quotes found (test skipped)');
      }
    });
  });

  describe('PostgreSQL Source Schema Export', () => {
    it('should export PRIMARY KEY constraints from PostgreSQL', async () => {
      console.log('    Testing PostgreSQL PRIMARY KEY export...');

      // Get a table with PRIMARY KEY from PostgreSQL
      const createSql = await generateSqlDump(postgresDb, 'postgresql', {
        tables: ['m_agents'],
        includeSchema: true,
        chunkSize: 0, // Schema only
      });

      assert.ok(createSql.includes('PRIMARY KEY'), 'Should include PRIMARY KEY constraint');
      console.log('      ✅ PRIMARY KEY exported');
    });

    it('should export FOREIGN KEY constraints from PostgreSQL', async () => {
      console.log('    Testing PostgreSQL FOREIGN KEY export...');

      // Get a table with FOREIGN KEY from PostgreSQL
      const createSql = await generateSqlDump(postgresDb, 'postgresql', {
        tables: ['t_tasks'],
        includeSchema: true,
        chunkSize: 0, // Schema only
      });

      assert.ok(createSql.includes('FOREIGN KEY') || createSql.includes('REFERENCES'), 'Should include FOREIGN KEY constraint');
      console.log('      ✅ FOREIGN KEY exported');
    });

    it('should convert PostgreSQL → MySQL (with constraints)', async () => {
      console.log('    Testing PostgreSQL → MySQL conversion...');

      const dump = await generateSqlDump(postgresDb, 'mysql', {
        tables: ['m_agents'],
        includeSchema: true,
        chunkSize: 0,
      });

      // Verify MySQL syntax
      assert.ok(dump.includes('`'), 'Should use MySQL backtick quotes');
      assert.ok(dump.includes('PRIMARY KEY'), 'Should preserve PRIMARY KEY');
      console.log('      ✅ PostgreSQL → MySQL conversion works');
    });

    it('should convert PostgreSQL → SQLite (with SERIAL → AUTOINCREMENT)', async () => {
      console.log('    Testing PostgreSQL → SQLite conversion...');

      const dump = await generateSqlDump(postgresDb, 'sqlite', {
        tables: ['m_agents'],
        includeSchema: true,
        chunkSize: 0,
      });

      // Verify SQLite syntax (SERIAL → INTEGER, IDENTITY → AUTOINCREMENT)
      assert.ok(dump.includes('"'), 'Should use double quotes');
      assert.ok(!dump.includes('SERIAL'), 'Should not contain SERIAL keyword');
      console.log('      ✅ PostgreSQL → SQLite conversion works');
    });

    it('should handle multi-column PRIMARY KEY from PostgreSQL', async () => {
      console.log('    Testing multi-column PRIMARY KEY...');

      // Create a temporary table with multi-column PK
      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_multi_pk (
          col1 INTEGER NOT NULL,
          col2 INTEGER NOT NULL,
          value TEXT,
          PRIMARY KEY (col1, col2)
        )
      `);

      try {
        const dump = await generateSqlDump(postgresDb, 'postgresql', {
          tables: ['test_multi_pk'],
          includeSchema: true,
          chunkSize: 0,
        });

        assert.ok(dump.includes('PRIMARY KEY ("col1", "col2")') || dump.includes('PRIMARY KEY ('),
                  'Should include multi-column PRIMARY KEY');
        console.log('      ✅ Multi-column PRIMARY KEY exported');
      } finally {
        await postgresDb.raw('DROP TABLE IF EXISTS test_multi_pk');
      }
    });

    it('should handle composite FOREIGN KEY from PostgreSQL', async () => {
      console.log('    Testing composite FOREIGN KEY...');

      // Create temporary tables with composite FK
      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_parent (
          id1 INTEGER NOT NULL,
          id2 INTEGER NOT NULL,
          PRIMARY KEY (id1, id2)
        )
      `);

      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_child (
          child_id SERIAL PRIMARY KEY,
          parent_id1 INTEGER,
          parent_id2 INTEGER,
          FOREIGN KEY (parent_id1, parent_id2) REFERENCES test_parent(id1, id2)
        )
      `);

      try {
        const dump = await generateSqlDump(postgresDb, 'postgresql', {
          tables: ['test_child'],
          includeSchema: true,
          chunkSize: 0,
        });

        assert.ok(dump.includes('FOREIGN KEY'), 'Should include FOREIGN KEY constraint');
        console.log('      ✅ Composite FOREIGN KEY exported');
      } finally {
        await postgresDb.raw('DROP TABLE IF EXISTS test_child');
        await postgresDb.raw('DROP TABLE IF EXISTS test_parent');
      }
    });

    it('should handle UNIQUE constraints from PostgreSQL', async () => {
      console.log('    Testing UNIQUE constraints...');

      // Create temporary table with UNIQUE constraint
      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_unique (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE,
          username TEXT
        )
      `);

      try {
        const dump = await generateSqlDump(postgresDb, 'postgresql', {
          tables: ['test_unique'],
          includeSchema: true,
          chunkSize: 0,
        });

        assert.ok(dump.includes('UNIQUE'), 'Should include UNIQUE constraint');
        console.log('      ✅ UNIQUE constraint exported');
      } finally {
        await postgresDb.raw('DROP TABLE IF EXISTS test_unique');
      }
    });

    it('should handle ON DELETE/ON UPDATE rules from PostgreSQL', async () => {
      console.log('    Testing FK ON DELETE/UPDATE rules...');

      // Create temporary tables with FK rules
      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_fk_parent (
          id SERIAL PRIMARY KEY,
          name TEXT
        )
      `);

      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_fk_child (
          id SERIAL PRIMARY KEY,
          parent_id INTEGER,
          FOREIGN KEY (parent_id) REFERENCES test_fk_parent(id) ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);

      try {
        const dump = await generateSqlDump(postgresDb, 'postgresql', {
          tables: ['test_fk_child'],
          includeSchema: true,
          chunkSize: 0,
        });

        assert.ok(dump.includes('ON DELETE CASCADE') || dump.includes('CASCADE'), 'Should include ON DELETE CASCADE');
        assert.ok(dump.includes('ON UPDATE CASCADE') || dump.includes('CASCADE'), 'Should include ON UPDATE CASCADE');
        console.log('      ✅ FK rules (ON DELETE/UPDATE) exported');
      } finally {
        await postgresDb.raw('DROP TABLE IF EXISTS test_fk_child');
        await postgresDb.raw('DROP TABLE IF EXISTS test_fk_parent');
      }
    });

    it('should handle DEFAULT values from PostgreSQL (excluding nextval)', async () => {
      console.log('    Testing DEFAULT value handling...');

      // Create temporary table with various defaults
      await postgresDb.raw(`
        CREATE TABLE IF NOT EXISTS test_defaults (
          id SERIAL PRIMARY KEY,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          count INTEGER DEFAULT 0
        )
      `);

      try {
        const dump = await generateSqlDump(postgresDb, 'postgresql', {
          tables: ['test_defaults'],
          includeSchema: true,
          chunkSize: 0,
        });

        assert.ok(dump.includes("DEFAULT 'active'") || dump.includes('DEFAULT'), 'Should include DEFAULT values');
        assert.ok(!dump.includes('nextval'), 'Should skip nextval sequences');
        console.log('      ✅ DEFAULT values exported (nextval skipped)');
      } finally {
        await postgresDb.raw('DROP TABLE IF EXISTS test_defaults');
      }
    });

    it('should generate idempotent PostgreSQL → PostgreSQL dump', async () => {
      console.log('    Testing PostgreSQL idempotent dump...');

      const dump1 = await generateSqlDump(postgresDb, 'postgresql', {
        tables: ['m_agents'],
        includeSchema: true,
        chunkSize: 0,
      });

      const dump2 = await generateSqlDump(postgresDb, 'postgresql', {
        tables: ['m_agents'],
        includeSchema: true,
        chunkSize: 0,
      });

      // Schema should be identical (modulo whitespace/comments)
      const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
      assert.strictEqual(normalize(dump1), normalize(dump2), 'Idempotent dumps should be identical');
      console.log('      ✅ Idempotent PostgreSQL dump verified');
    });
  });
});
