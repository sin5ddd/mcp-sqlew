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
 * - Run: docker-compose -f docker-compose.test.yml up -d
 */

import knex, { Knex } from 'knex';
import { generateSqlDump } from '../utils/sql-dump.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Test database configurations
const configs = {
  sqlite: {
    client: 'better-sqlite3',
    connection: { filename: '.sqlew/sqlew.db' },
    useNullAsDefault: true,
  },
  postgresql: {
    client: 'pg',
    connection: {
      host: 'localhost',
      port: 5433,
      user: 'testuser',
      password: 'testpass',
      database: 'sqlew_test',
    },
  },
  mysql: {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      port: 3308,
      user: 'testuser',
      password: 'testpass',
      database: 'sqlew_test',
    },
  },
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
        await execAsync(`docker cp ${tempFile} mcp-sqlew_postgres_1:/tmp/import.sql`);
        await execAsync(
          `docker exec mcp-sqlew_postgres_1 psql -U testuser -d sqlew_test -f /tmp/import.sql -v ON_ERROR_STOP=1 -q`,
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
        await execAsync(`docker cp ${tempFile} mcp-sqlew_mysql_1:/tmp/import.sql`);
        await execAsync(
          `docker exec mcp-sqlew_mysql_1 sh -c "mysql -u testuser -ptestpass sqlew_test < /tmp/import.sql"`,
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
});
