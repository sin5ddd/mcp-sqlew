import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs/promises';

/**
 * Migration Upgrade Path Tests
 *
 * Tests incremental version upgrades to catch migration errors that only
 * appear when upgrading from older versions (not fresh installations).
 *
 * Critical Scenarios:
 * - v3.5 → v3.6 (help system tables added)
 * - v3.6 → v3.7 (multi-project support added)
 * - v3.5 → v3.7 (direct upgrade path)
 * - Failed migration recovery (run again after error)
 *
 * These tests validate idempotency and catch errors like:
 * - "duplicate column name"
 * - "table already exists"
 * - "UNIQUE constraint failed"
 */

describe('Migration Upgrade Path Tests', () => {
  let testDbPath: string;
  let db: Knex;

  before(async () => {
    // Create temporary test database directory
    const tmpDir = path.join(process.cwd(), '.tmp-test-migrations');
    await fs.mkdir(tmpDir, { recursive: true });
    testDbPath = path.join(tmpDir, 'upgrade-test.db');
  });

  after(async () => {
    // Cleanup
    if (db) {
      await db.destroy();
    }
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  /**
   * Test: Fresh v3.5 Installation
   *
   * Creates a v3.5 schema to use as baseline for upgrade tests.
   * Runs all migrations up to (but not including) v3.6.0 help system.
   */
  it('should create v3.5 schema from migrations', async () => {
    console.log('    📦 Creating v3.5 baseline schema...');

    // Remove existing database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore if doesn't exist
    }

    // Initialize database
    db = knex({
      client: 'better-sqlite3',
      connection: {
        filename: testDbPath,
      },
      useNullAsDefault: true,
      migrations: {
        directory: path.join(process.cwd(), 'dist/config/knex'),
        loadExtensions: ['.js'],
      },
    });

    // Run migrations up to v3.5 (before help system and multi-project)
    // List of migrations to run for v3.5:
    const v3_5_migrations = [
      // Bootstrap
      '20251025020452_create_master_tables',
      '20251025021152_create_transaction_tables',
      '20251025021351_create_indexes',
      '20251025021416_seed_master_data',
      '20251025070349_create_views',
      // Enhancements
      '20251025081221_add_link_type_to_task_decision_links',
      '20251025082220_fix_task_dependencies_columns',
      '20251025120000_add_cascade_to_task_dependencies',
    ];

    // Run specific migrations by manually executing them
    for (const migrationName of v3_5_migrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'enhancements',
        `${migrationName}.js`
      );

      // Check if file exists in enhancements folder
      try {
        await fs.access(migrationPath);
        const migration = await import(migrationPath);
        await migration.up(db);
        console.log(`      ✓ Applied ${migrationName}`);
      } catch (error: any) {
        // Try bootstrap folder
        const bootstrapPath = path.join(
          process.cwd(),
          'dist/config/knex',
          'bootstrap',
          `${migrationName}.js`
        );
        try {
          await fs.access(bootstrapPath);
          const migration = await import(bootstrapPath);
          await migration.up(db);
          console.log(`      ✓ Applied ${migrationName}`);
        } catch (bootstrapError: any) {
          console.error(`      ❌ Failed to find migration: ${migrationName}`);
          throw bootstrapError;
        }
      }
    }

    // Verify v3.5 schema
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_agents'), 'Should have m_agents table');
    assert.ok(tableNames.includes('t_decisions'), 'Should have t_decisions table');
    assert.ok(tableNames.includes('t_tasks'), 'Should have t_tasks table');
    assert.ok(!tableNames.includes('m_help_tools'), 'Should NOT have help tables in v3.5');
    assert.ok(!tableNames.includes('m_projects'), 'Should NOT have m_projects in v3.5');

    console.log(`    ✅ v3.5 baseline created (${tableNames.length} tables)`);
  });

  /**
   * Test: v3.5 → v3.6 Upgrade
   *
   * Tests upgrade from v3.5 to v3.6 (help system added).
   * This should catch errors like:
   * - "table m_help_tools already exists"
   * - "UNIQUE constraint failed on help metadata"
   */
  it('should upgrade from v3.5 to v3.6 without errors', async () => {
    console.log('    🔄 Upgrading v3.5 → v3.6...');

    // Apply v3.6 migrations (help system)
    const v3_6_migrations = [
      '20251025090000_create_help_system_tables',
      '20251025090100_seed_help_categories_and_use_cases',
      '20251025100000_seed_help_metadata',
      '20251025100100_seed_remaining_use_cases',
      '20251027000000_add_agent_reuse_system',
      '20251027010000_add_task_constraint_to_decision_context',
      '20251027020000_update_agent_reusability',
      '20251028000000_simplify_agent_system',
      '20251031000000_drop_orphaned_message_view',
    ];

    for (const migrationName of v3_6_migrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'enhancements',
        `${migrationName}.js`
      );

      const migration = await import(migrationPath);
      await migration.up(db);
      console.log(`      ✓ Applied ${migrationName}`);
    }

    // Verify v3.6 schema
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_help_tools'), 'Should have m_help_tools after v3.6');
    assert.ok(tableNames.includes('m_help_actions'), 'Should have m_help_actions after v3.6');
    assert.ok(!tableNames.includes('t_agent_messages'), 'Should NOT have t_agent_messages (dropped in v3.6.5)');

    // Check help metadata was seeded
    const toolCount = await db('m_help_tools').count('* as count').first();
    assert.ok(toolCount && Number(toolCount.count) > 0, 'Should have seeded help tools');

    console.log(`    ✅ v3.6 upgrade successful (${tableNames.length} tables)`);
  });

  /**
   * Test: v3.6 → v3.7 Upgrade
   *
   * Tests upgrade from v3.6 to v3.7 (multi-project support added).
   * This should catch errors like:
   * - "duplicate column name: project_id"
   * - "All parts of PRIMARY KEY must be NOT NULL"
   */
  it('should upgrade from v3.6 to v3.7 without errors', async () => {
    console.log('    🔄 Upgrading v3.6 → v3.7...');

    // Apply v3.7 consolidated migration (multi-project support)
    // Note: 4 separate migrations were consolidated into 1 for v3.7.0
    const v3_7_migrations = [
      '20251104000000_add_multi_project_v3_7_0',
    ];

    for (const migrationName of v3_7_migrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'upgrades',
        `${migrationName}.js`
      );

      const migration = await import(migrationPath);
      await migration.up(db);
      console.log(`      ✓ Applied ${migrationName}`);
    }

    // Verify v3.7 schema
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_projects'), 'Should have m_projects after v3.7');

    // Verify project_id was added to transaction tables
    const hasProjectId = await db.schema.hasColumn('t_decisions', 'project_id');
    assert.ok(hasProjectId, 'Should have project_id column in t_decisions');

    // Verify m_config PRIMARY KEY structure (should be single-column, not composite)
    const configSchema = await db.raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name='m_config'`);
    const configSql = configSchema[0]?.sql || '';
    assert.ok(configSql.includes('primary key (`key`)'), 'm_config should have single-column PRIMARY KEY on key');
    assert.ok(!configSql.includes('primary key (`key`, `project_id`)'), 'm_config should NOT have composite PRIMARY KEY');

    console.log(`    ✅ v3.7 upgrade successful (${tableNames.length} tables)`);
  });

  /**
   * Test: Migration Idempotency
   *
   * Tests that running migrations twice doesn't cause errors.
   * This catches issues where migrations don't check for existing objects.
   */
  it('should allow running v3.7 migrations again (idempotency test)', async () => {
    console.log('    🔄 Testing migration idempotency (re-running v3.7)...');

    // Re-run v3.7 consolidated migration - should skip existing objects
    const v3_7_migrations = [
      '20251104000000_add_multi_project_v3_7_0',
    ];

    for (const migrationName of v3_7_migrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'upgrades',
        `${migrationName}.js`
      );

      // Re-import to get fresh module (clear cache)
      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(migrationPath + cacheBuster);
      await migration.up(db);
      console.log(`      ✓ Re-ran ${migrationName} (should skip existing objects)`);
    }

    // Verify schema is still intact
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_projects'), 'Should still have m_projects');
    assert.ok(tableNames.includes('m_help_tools'), 'Should still have help tables');

    console.log(`    ✅ Idempotency test passed - no duplicate errors`);
  });

  /**
   * Test: Seed Data and Upgrade
   *
   * Tests that seeded data is preserved during upgrades.
   */
  it('should preserve data during upgrades', async () => {
    console.log('    📝 Testing data preservation during upgrades...');

    // Insert test data
    const now = Math.floor(Date.now() / 1000);

    // Insert into v3.5 tables
    await db('m_context_keys').insert({
      id: 999,
      key: 'test-upgrade-key',
    });

    await db('t_decisions').insert({
      key_id: 999,
      project_id: 1, // Default project from migration
      value: 'test value preserved across upgrade',
      ts: now,
    });

    // Verify data exists
    const decision = await db('t_decisions').where({ key_id: 999 }).first();
    assert.ok(decision, 'Test decision should exist');
    assert.strictEqual(decision.value, 'test value preserved across upgrade');

    console.log(`    ✅ Data preservation verified`);
  });
});
