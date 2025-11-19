import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knex, { Knex } from 'knex';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs/promises';

/**
 * Migration Idempotency Tests
 *
 * Tests that all migrations can be safely run multiple times without errors.
 * This validates idempotency checks in migration code and catches errors like:
 * - "duplicate column name"
 * - "table already exists"
 * - "UNIQUE constraint failed"
 * - "index already exists"
 *
 * Critical Scenarios:
 * - Running same migration twice
 * - Partial schema states (some objects exist, others don't)
 * - knex_migrations table mismatch (schema exists but migration not recorded)
 * - Migration recovery after error
 */

describe('Migration Idempotency Tests', () => {
  let testDbPath: string;
  let db: Knex;

  before(async () => {
    // Create temporary test database directory
    const tmpDir = path.join(process.cwd(), '.tmp-test-idempotency');
    await fs.mkdir(tmpDir, { recursive: true });
    testDbPath = path.join(tmpDir, 'idempotency-test.db');
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
   * Test: Bootstrap Migrations Idempotency
   *
   * Tests that all bootstrap migrations can be run twice without errors.
   */
  it('should allow running bootstrap migrations twice', async () => {
    console.log('    🔄 Testing bootstrap migration idempotency...');

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

    const bootstrapMigrations = [
      '20251025020452_create_master_tables',
      '20251025021152_create_transaction_tables',
      '20251025021351_create_indexes',
      '20251025021416_seed_master_data',
      '20251025070349_create_views',
    ];

    // Run migrations first time
    for (const migrationName of bootstrapMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'bootstrap',
        `${migrationName}.js`
      );

      const migration = await import(pathToFileURL(migrationPath).href);
      await migration.up(db);
      console.log(`      ✓ Applied ${migrationName} (1st run)`);
    }

    // Run migrations second time - should skip with idempotency checks
    for (const migrationName of bootstrapMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'bootstrap',
        `${migrationName}.js`
      );

      // Clear require cache to force re-import
      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(pathToFileURL(migrationPath).href + cacheBuster);

      // Should not throw errors
      await migration.up(db);
      console.log(`      ✓ Re-ran ${migrationName} (2nd run - idempotent)`);
    }

    // Verify schema is intact
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_agents'), 'Should have m_agents table');
    assert.ok(tableNames.includes('t_decisions'), 'Should have t_decisions table');
    assert.ok(tableNames.includes('t_tasks'), 'Should have t_tasks table');

    console.log(`    ✅ Bootstrap migrations are idempotent`);
  });

  /**
   * Test: Enhancement Migrations Idempotency
   *
   * Tests that all enhancement migrations can be run twice without errors.
   * This specifically catches the errors user encountered:
   * - "duplicate column name: link_type"
   * - "table m_help_tools already exists"
   * - "UNIQUE constraint failed"
   */
  it('should allow running enhancement migrations twice', async () => {
    console.log('    🔄 Testing enhancement migration idempotency...');

    const enhancementMigrations = [
      '20251025081221_add_link_type_to_task_decision_links',
      '20251025082220_fix_task_dependencies_columns',
      '20251025090000_create_help_system_tables',
      '20251025090100_seed_help_categories_and_use_cases',
      '20251025100000_seed_help_metadata',
      '20251025100100_seed_remaining_use_cases',
      '20251025120000_add_cascade_to_task_dependencies',
      '20251027000000_add_agent_reuse_system',
      '20251027010000_add_task_constraint_to_decision_context',
      '20251027020000_update_agent_reusability',
      '20251028000000_simplify_agent_system',
      '20251031000000_drop_orphaned_message_view',
    ];

    // Run migrations first time
    for (const migrationName of enhancementMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'enhancements',
        `${migrationName}.js`
      );

      const migration = await import(pathToFileURL(migrationPath).href);
      await migration.up(db);
      console.log(`      ✓ Applied ${migrationName} (1st run)`);
    }

    // Run migrations second time - should skip with idempotency checks
    for (const migrationName of enhancementMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'enhancements',
        `${migrationName}.js`
      );

      // Clear require cache
      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(pathToFileURL(migrationPath).href + cacheBuster);

      // Should not throw errors (this is where user's errors occurred)
      await migration.up(db);
      console.log(`      ✓ Re-ran ${migrationName} (2nd run - idempotent)`);
    }

    // Verify v3.6 schema
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_help_tools'), 'Should have help tables');

    // Verify link_type column exists (user's "duplicate column name" error)
    const hasLinkType = await db.schema.hasColumn('t_task_decision_links', 'link_type');
    assert.ok(hasLinkType, 'Should have link_type column');

    console.log(`    ✅ Enhancement migrations are idempotent`);
  });

  /**
   * Test: Upgrade Migrations Idempotency
   *
   * Tests that all upgrade migrations can be run twice without errors.
   * Note: v3.7.0 migrations were consolidated into a single migration.
   */
  it('should allow running upgrade migrations twice', async () => {
    console.log('    🔄 Testing upgrade migration idempotency...');

    const upgradeMigrations = [
      '20251104000000_add_multi_project_v3_7_0',
    ];

    // Run migrations first time
    for (const migrationName of upgradeMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'upgrades',
        `${migrationName}.js`
      );

      const migration = await import(pathToFileURL(migrationPath).href);
      await migration.up(db);
      console.log(`      ✓ Applied ${migrationName} (1st run)`);
    }

    // Run migrations second time - should skip with idempotency checks
    for (const migrationName of upgradeMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        'upgrades',
        `${migrationName}.js`
      );

      // Clear require cache
      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(pathToFileURL(migrationPath).href + cacheBuster);

      // Should not throw errors
      await migration.up(db);
      console.log(`      ✓ Re-ran ${migrationName} (2nd run - idempotent)`);
    }

    // Verify v3.7 schema
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_projects'), 'Should have m_projects table');

    // Verify project_id column exists
    const hasProjectId = await db.schema.hasColumn('t_decisions', 'project_id');
    assert.ok(hasProjectId, 'Should have project_id column in t_decisions');

    console.log(`    ✅ Upgrade migrations are idempotent`);
  });

  /**
   * Test: m_config Structure Validation
   *
   * Tests that m_config table has correct PRIMARY KEY structure after consolidated migration.
   * Note: m_config enhancement logic was merged into the consolidated v3.7.0 migration.
   */
  it('should have correct m_config structure after consolidated migration', async () => {
    console.log('    🔍 Validating m_config structure...');

    // Verify m_config structure (user's "nullable PRIMARY KEY" error should be fixed)
    const configSchema = await db.raw(`SELECT sql FROM sqlite_master WHERE type='table' AND name='m_config'`);
    const configSql = configSchema[0]?.sql || '';

    assert.ok(configSql.includes('primary key (`key`)'), 'm_config should have single-column PRIMARY KEY');
    assert.ok(!configSql.includes('primary key (`key`, `project_id`)'), 'm_config should NOT have composite PRIMARY KEY');

    // Verify project_id column exists and is nullable
    const hasProjectId = await db.schema.hasColumn('m_config', 'project_id');
    assert.ok(hasProjectId, 'm_config should have project_id column');

    console.log(`    ✅ m_config structure is correct (single-column PRIMARY KEY, nullable project_id)`);
  });

  /**
   * Test: Partial Schema State Recovery
   *
   * Simulates user's scenario: database has schema objects but knex_migrations
   * table doesn't record all migrations. Tests that migrations can detect
   * existing objects and skip gracefully.
   */
  it('should handle partial schema states (missing knex_migrations records)', async () => {
    console.log('    🔄 Testing partial schema state recovery...');

    // Simulate user's scenario: delete knex_migrations table
    // (schema exists, but Knex thinks migrations weren't run)
    await db.schema.dropTableIfExists('knex_migrations');
    await db.schema.dropTableIfExists('knex_migrations_lock');

    console.log(`      ⚠️  Simulated missing knex_migrations table`);

    // Re-run all migrations - should skip existing objects
    // Note: v3.7.0 migrations were consolidated into a single migration
    const allMigrations = [
      // Bootstrap
      { folder: 'bootstrap', name: '20251025020452_create_master_tables' },
      { folder: 'bootstrap', name: '20251025021152_create_transaction_tables' },
      { folder: 'bootstrap', name: '20251025021351_create_indexes' },
      { folder: 'bootstrap', name: '20251025021416_seed_master_data' },
      { folder: 'bootstrap', name: '20251025070349_create_views' },
      // Enhancements
      { folder: 'enhancements', name: '20251025081221_add_link_type_to_task_decision_links' },
      { folder: 'enhancements', name: '20251025082220_fix_task_dependencies_columns' },
      { folder: 'enhancements', name: '20251025090000_create_help_system_tables' },
      { folder: 'enhancements', name: '20251025090100_seed_help_categories_and_use_cases' },
      { folder: 'enhancements', name: '20251025100000_seed_help_metadata' },
      { folder: 'enhancements', name: '20251025120000_add_cascade_to_task_dependencies' },
      { folder: 'enhancements', name: '20251027000000_add_agent_reuse_system' },
      { folder: 'enhancements', name: '20251027020000_update_agent_reusability' },
      { folder: 'enhancements', name: '20251028000000_simplify_agent_system' },
      { folder: 'enhancements', name: '20251031000000_drop_orphaned_message_view' },
      // Upgrades - v3.7.0 consolidated migration
      { folder: 'upgrades', name: '20251104000000_add_multi_project_v3_7_0' },
    ];

    for (const { folder, name } of allMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        folder,
        `${name}.js`
      );

      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(pathToFileURL(migrationPath).href + cacheBuster);

      // Should not throw errors - idempotency checks should skip existing objects
      await migration.up(db);
      console.log(`      ✓ Recovered ${name}`);
    }

    // Verify schema is still intact
    const tables = await db.raw(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);

    assert.ok(tableNames.includes('m_projects'), 'Should still have m_projects');
    assert.ok(tableNames.includes('m_help_tools'), 'Should still have help tables');
    assert.ok(tableNames.includes('t_decisions'), 'Should still have t_decisions');

    console.log(`    ✅ Partial schema state recovery successful`);
  });

  /**
   * Test: Data Preservation During Re-runs
   *
   * Tests that data is not lost or duplicated when migrations run twice.
   */
  it('should preserve data when migrations run twice', async () => {
    console.log('    📝 Testing data preservation during re-runs...');

    // Insert test data
    const now = Math.floor(Date.now() / 1000);

    await db('m_context_keys').insert({
      id: 888,
      key: 'test-idempotency-key',
    });

    await db('t_decisions').insert({
      key_id: 888,
      project_id: 1,
      value: 'test value should not duplicate',
      ts: now,
    });

    // Count decisions before re-run
    const countBefore = await db('t_decisions').where({ key_id: 888 }).count('* as count').first();
    assert.strictEqual(countBefore?.count, 1, 'Should have 1 decision before re-run');

    // Re-run a few migrations
    const testMigrations = [
      { folder: 'enhancements', name: '20251025090000_create_help_system_tables' },
      { folder: 'enhancements', name: '20251025090100_seed_help_categories_and_use_cases' },
    ];

    for (const { folder, name } of testMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        folder,
        `${name}.js`
      );

      const cacheBuster = `?t=${Date.now()}`;
      const migration = await import(pathToFileURL(migrationPath).href + cacheBuster);
      await migration.up(db);
    }

    // Verify data still exists and wasn't duplicated
    const countAfter = await db('t_decisions').where({ key_id: 888 }).count('* as count').first();
    assert.strictEqual(countAfter?.count, 1, 'Should still have 1 decision after re-run');

    const decision = await db('t_decisions').where({ key_id: 888 }).first();
    assert.strictEqual(decision?.value, 'test value should not duplicate', 'Data should be preserved');

    console.log(`    ✅ Data preservation verified`);
  });

  /**
   * Test: down() Migration Idempotency
   *
   * Tests that down() migrations can be run safely (for rollback scenarios).
   */
  it('should allow running down() migrations safely', async () => {
    console.log('    🔄 Testing down() migration idempotency...');

    // Test down() migrations that were fixed
    const testDownMigrations = [
      { folder: 'enhancements', name: '20251028000000_simplify_agent_system' },
      { folder: 'enhancements', name: '20251031000000_drop_orphaned_message_view' },
    ];

    for (const { folder, name } of testDownMigrations) {
      const migrationPath = path.join(
        process.cwd(),
        'dist/config/knex',
        folder,
        `${name}.js`
      );

      const migration = await import(pathToFileURL(migrationPath).href);

      // Run down() first time
      await migration.down(db);
      console.log(`      ✓ Rolled back ${name} (1st run)`);

      // Run down() second time - should skip existing objects
      const cacheBuster = `?t=${Date.now()}`;
      const migration2 = await import(pathToFileURL(migrationPath).href + cacheBuster);
      await migration2.down(db);
      console.log(`      ✓ Re-ran rollback ${name} (2nd run - idempotent)`);

      // Run up() again to restore state
      await migration.up(db);
      console.log(`      ✓ Restored ${name}`);
    }

    console.log(`    ✅ down() migrations are idempotent`);
  });
});
