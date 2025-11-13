/**
 * Schema-only migration tests (CREATE TABLE + CREATE VIEW)
 *
 * Tests that schema structures can be migrated across databases
 * without data type conversion issues.
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
};

describe('Schema Migration Tests (No Data)', () => {
  let sqliteDb: Knex;
  let postgresDb: Knex;

  before(async () => {
    sqliteDb = knex(configs.sqlite);
    postgresDb = knex(configs.postgresql);

    console.log('  Verifying database connections...');
    await postgresDb.raw('SELECT 1');
    console.log('  ✅ Databases connected');
  });

  after(async () => {
    await sqliteDb.destroy();
    await postgresDb.destroy();
  });

  it('should generate schema-only dump (CREATE TABLE + CREATE VIEW)', async () => {
    console.log('    Generating schema-only dump...');

    const dump = await generateSqlDump(sqliteDb, 'postgresql', {
      includeHeader: true,
      includeSchema: true,
      chunkSize: 0, // No data, schema only
    });

    // Verify schema elements present
    assert.ok(dump.includes('CREATE TABLE'), 'Should contain CREATE TABLE statements');
    assert.ok(dump.includes('CREATE VIEW'), 'Should contain CREATE VIEW statements');
    assert.ok(!dump.includes('insert into'), 'Should NOT contain INSERT statements');

    console.log(`    ✅ Schema dump generated (${dump.length} chars)`);
  });

  it('should migrate schema to PostgreSQL successfully', async () => {
    console.log('    Migrating schema to PostgreSQL...');

    // Generate schema-only dump
    const dump = await generateSqlDump(sqliteDb, 'postgresql', {
      includeSchema: true,
      chunkSize: 0, // Schema only, no data
    });

    // Drop and recreate schema
    await postgresDb.raw('DROP SCHEMA public CASCADE');
    await postgresDb.raw('CREATE SCHEMA public');

    // Import via psql
    const tempFile = '/tmp/sqlew-schema-test.sql';
    writeFileSync(tempFile, dump);

    try {
      await execAsync(`docker cp ${tempFile} mcp-sqlew_postgres_1:/tmp/schema.sql`);
      await execAsync(
        `docker exec mcp-sqlew_postgres_1 psql -U testuser -d sqlew_test -f /tmp/schema.sql -v ON_ERROR_STOP=1 -q`
      );
    } finally {
      unlinkSync(tempFile);
    }

    // Verify tables created
    const tables = await postgresDb.raw(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'm_%' OR tablename LIKE 't_%'
    `);

    assert.ok(tables.rows.length > 10, 'Should create multiple tables');
    console.log(`    ✅ Schema migrated: ${tables.rows.length} tables created`);

    // Verify views created
    const views = await postgresDb.raw(`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'
    `);

    assert.ok(views.rows.length > 0, 'Should create views');
    console.log(`    ✅ Views created: ${views.rows.length} views`);
  });

  it('should verify view definitions are valid', async () => {
    console.log('    Verifying view definitions...');

    // Query each view to ensure it's valid SQL
    const views = await postgresDb.raw(`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'
    `);

    for (const row of views.rows) {
      const viewName = row.viewname;

      // Query the view (should not throw)
      await postgresDb.raw(`SELECT * FROM "${viewName}" LIMIT 0`);
      console.log(`      ✅ View "${viewName}" is valid`);
    }

    console.log(`    ✅ All ${views.rows.length} views are valid`);
  });
});
