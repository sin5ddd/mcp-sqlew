/**
 * v4.0 Native RDBMS Fresh Install Test
 *
 * Tests v4.0 migrations on MySQL, MariaDB, and PostgreSQL
 *
 * Mode: V4_ONLY - Tests only v4 schema (skips v3 migrations)
 *       This validates that v4 schema is correctly designed for all RDBMS
 */

import knex, { Knex } from 'knex';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Test mode: 'v4_only' tests just v4 schema, 'full' includes v3 migrations
const TEST_MODE = process.env.V4_TEST_MODE || 'v4_only';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DbConfig {
  name: string;
  client: string;
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
}

const databases: DbConfig[] = [
  {
    name: 'MySQL 8.0',
    client: 'mysql2',
    connection: {
      host: '127.0.0.1',
      port: 3307,
      user: 'mcp_user',
      password: 'mcp_pass',
      database: 'mcp_test',
    },
  },
  {
    name: 'MariaDB 10.5',
    client: 'mysql2',
    connection: {
      host: '127.0.0.1',
      port: 3308,
      user: 'mcp_user',
      password: 'mcp_pass',
      database: 'mcp_test',
    },
  },
  {
    name: 'PostgreSQL 16',
    client: 'pg',
    connection: {
      host: '127.0.0.1',
      port: 15432,
      user: 'mcp_user',
      password: 'mcp_pass',
      database: 'mcp_test',
    },
  },
];

async function dropAllTables(db: Knex, dbName: string): Promise<void> {
  console.log(`  📦 Dropping all existing tables in ${dbName}...`);

  const client = db.client.config.client;
  const isPostgres = client === 'pg';
  const isMySQL = client === 'mysql2' || client === 'mysql';

  if (isPostgres) {
    // PostgreSQL: Drop all tables in public schema
    await db.raw(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
  } else if (isMySQL) {
    // MySQL/MariaDB: Disable FK checks and drop all tables
    await db.raw('SET FOREIGN_KEY_CHECKS = 0');
    const tables = await db.raw('SHOW TABLES');
    const tableKey = Object.keys(tables[0] || {})[0];
    for (const row of tables[0] || []) {
      const tableName = row[tableKey];
      await db.raw(`DROP TABLE IF EXISTS \`${tableName}\``);
    }
    await db.raw('SET FOREIGN_KEY_CHECKS = 1');
  }

  // Also ensure knex_migrations and knex_migrations_lock are gone for clean start
  try {
    await db.schema.dropTableIfExists('knex_migrations');
    await db.schema.dropTableIfExists('knex_migrations_lock');
    console.log('  ✓ Dropped knex migration tracking tables');
  } catch (err) {
    // Ignore errors - tables might not exist
  }
}

async function testDatabase(config: DbConfig): Promise<{ success: boolean; error?: string }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 Testing ${config.name}`);
  console.log(`${'='.repeat(60)}`);

  let db: Knex | null = null;

  try {
    // Create Knex instance
    // In v4_only mode, only run v4 migrations (skip v3 which has cross-db issues)
    const migrationDirs = TEST_MODE === 'v4_only'
      ? [path.join(__dirname, '../database/migrations/v4')]
      : [
          path.join(__dirname, '../database/migrations/v3'),
          path.join(__dirname, '../database/migrations/v4'),
        ];

    db = knex({
      client: config.client,
      connection: config.connection,
      migrations: {
        directory: migrationDirs,
        extension: 'ts',
        loadExtensions: ['.ts'],
      },
      pool: { min: 0, max: 5 },
    });

    console.log(`  📁 Test mode: ${TEST_MODE} (dirs: ${migrationDirs.length})`);

    // Test connection
    console.log('  🔌 Testing connection...');
    await db.raw('SELECT 1');
    console.log('  ✅ Connection successful');

    // Drop all existing tables for fresh install test
    await dropAllTables(db, config.name);

    // Run migrations
    console.log('  🔄 Running migrations...');
    const [batchNo, log] = await db.migrate.latest();
    console.log(`  ✅ Batch ${batchNo} run: ${log.length} migrations`);

    // Verify v4 tables exist
    console.log('  📋 Verifying v4 tables...');
    const v4Tables = [
      'v4_projects',
      'v4_decisions',
      'v4_tasks',
      'v4_constraints',
      'v4_file_changes',
      'v4_layers',
      'v4_tags',
      'v4_task_statuses',
      // Note: v4_config removed in v4.0 - config is now in-memory
    ];

    for (const table of v4Tables) {
      const exists = await db.schema.hasTable(table);
      if (!exists) {
        throw new Error(`Table ${table} does not exist`);
      }
    }
    console.log(`  ✅ All ${v4Tables.length} v4 tables exist`);

    // Verify master data
    console.log('  📊 Verifying master data...');
    const layers = await db('v4_layers').count('* as count').first();
    const statuses = await db('v4_task_statuses').count('* as count').first();
    const projects = await db('v4_projects').count('* as count').first();
    const tags = await db('v4_tags').count('* as count').first();

    console.log(`    - v4_layers: ${layers?.count} rows`);
    console.log(`    - v4_task_statuses: ${statuses?.count} rows`);
    console.log(`    - v4_projects: ${projects?.count} rows`);
    console.log(`    - v4_tags: ${tags?.count} rows`);

    if (Number(layers?.count) !== 9) {
      throw new Error(`Expected 9 layers, got ${layers?.count}`);
    }
    if (Number(statuses?.count) !== 6) {
      throw new Error(`Expected 6 task statuses, got ${statuses?.count}`);
    }
    if (Number(projects?.count) < 1) {
      throw new Error(`Expected at least 1 project, got ${projects?.count}`);
    }

    console.log(`  ✅ Master data verified`);

    // Test FK constraints
    console.log('  🔗 Testing FK constraints...');
    try {
      await db('v4_decisions').insert({
        project_id: 9999, // Non-existent
        key_id: 1,
        value: 'test',
        version: '1.0.0',
        status: 1,
        ts: Math.floor(Date.now() / 1000),
        layer_id: 1,
      });
      throw new Error('FK constraint should have prevented insert');
    } catch (error: any) {
      if (
        error.message.includes('foreign key') ||
        error.message.includes('FOREIGN KEY') ||
        error.message.includes('violates foreign key') ||
        error.message.includes('Cannot add or update')
      ) {
        console.log('  ✅ FK constraint working correctly');
      } else {
        throw error;
      }
    }

    console.log(`\n✅ ${config.name} - Fresh install successful!`);
    return { success: true };
  } catch (error: any) {
    console.log(`\n❌ ${config.name} - Failed: ${error.message}`);
    if (error.stack) {
      console.log(error.stack.split('\n').slice(0, 5).join('\n'));
    }
    return { success: false, error: error.message };
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

async function main() {
  console.log('🚀 Starting v4.0 Native RDBMS Fresh Install Tests');
  console.log(`   Testing: MySQL 8.0, MariaDB 10.5, PostgreSQL 16`);

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const config of databases) {
    const result = await testDatabase(config);
    results.push({ name: config.name, ...result });
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log(`${'='.repeat(60)}`);

  let allPassed = true;
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${result.name}`);
    if (result.error) {
      console.log(`         Error: ${result.error}`);
    }
    if (!result.success) allPassed = false;
  }

  console.log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
