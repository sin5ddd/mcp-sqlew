/**
 * Topological Sort Unit Tests
 *
 * Tests the foreign key dependency resolution and topological sorting logic.
 * Uses DRY shared test utilities from test-helpers.ts
 *
 * MAINTENANCE NOTE:
 * The "End-to-End Sorting with Real Schema" test validates table ordering against
 * the actual mcp-sqlew schema by running all migrations. This test MUST be updated
 * whenever new tables or foreign key relationships are added to the schema.
 *
 * What to update after schema changes:
 * 1. Add assertions for new FK dependencies (e.g., "new_table should come after parent_table")
 * 2. Verify master tables (m_*) still come before transaction tables (t_*)
 * 3. Check that the test database isolation (unique temp files) prevents conflicts
 *
 * Why this matters:
 * SQL dumps export tables in dependency order. If topological sort fails or produces
 * wrong order, importing the dump will fail with "table does not exist" errors.
 *
 * Test structure:
 * - Pure algorithm tests: Validate sorting logic with synthetic data
 * - SQLite integration tests: Test FK extraction from real schema
 * - End-to-end test: Validate with full production schema (requires maintenance)
 */

import { describe, it, afterEach, before } from 'node:test';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { getTableDependencies, topologicalSort } from '../../../utils/sql-dump/index.js';
import { connectDb, disconnectDb, getDbConfig, dropAllTables } from '../../utils/test-helpers.js';
import { Knex } from 'knex';

describe('Topological Sort Unit Tests', () => {
  // Generate unique database path for this test suite to avoid conflicts
  const TEST_DB_PATH = `.tmp-test/table-ordering-${Date.now()}.db`;

  // Ensure test directory exists
  before(() => {
    mkdirSync('.tmp-test', { recursive: true });
  });

  describe('topologicalSort() - Pure Algorithm Tests', () => {
    it('should handle empty table list', () => {
      const tables: string[] = [];
      const dependencies = new Map<string, string[]>();
      const sorted = topologicalSort(tables, dependencies);

      assert.deepStrictEqual(sorted, []);
    });

    it('should handle single table with no dependencies', () => {
      const tables = ['table_a'];
      const dependencies = new Map<string, string[]>([['table_a', []]]);
      const sorted = topologicalSort(tables, dependencies);

      assert.deepStrictEqual(sorted, ['table_a']);
    });

    it('should sort linear dependency chain (A←B←C←D)', () => {
      // D depends on C, C depends on B, B depends on A
      const tables = ['table_d', 'table_c', 'table_b', 'table_a'];
      const dependencies = new Map<string, string[]>([
        ['table_a', []],
        ['table_b', ['table_a']],
        ['table_c', ['table_b']],
        ['table_d', ['table_c']],
      ]);

      const sorted = topologicalSort(tables, dependencies);

      // Parents must come before children: A → B → C → D
      const indexA = sorted.indexOf('table_a');
      const indexB = sorted.indexOf('table_b');
      const indexC = sorted.indexOf('table_c');
      const indexD = sorted.indexOf('table_d');

      assert.ok(indexA < indexB, 'A should come before B');
      assert.ok(indexB < indexC, 'B should come before C');
      assert.ok(indexC < indexD, 'C should come before D');
    });

    it('should sort diamond dependency (A←B,C; B,C←D)', () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      // D depends on both B and C, which both depend on A
      const tables = ['table_d', 'table_c', 'table_b', 'table_a'];
      const dependencies = new Map<string, string[]>([
        ['table_a', []],
        ['table_b', ['table_a']],
        ['table_c', ['table_a']],
        ['table_d', ['table_b', 'table_c']],
      ]);

      const sorted = topologicalSort(tables, dependencies);

      const indexA = sorted.indexOf('table_a');
      const indexB = sorted.indexOf('table_b');
      const indexC = sorted.indexOf('table_c');
      const indexD = sorted.indexOf('table_d');

      // A must come before B and C
      assert.ok(indexA < indexB, 'A should come before B');
      assert.ok(indexA < indexC, 'A should come before C');

      // B and C must come before D
      assert.ok(indexB < indexD, 'B should come before D');
      assert.ok(indexC < indexD, 'C should come before D');
    });

    it('should handle circular dependency (A←B←C←A) with warning', () => {
      // Circular: A → B → C → A
      const tables = ['table_a', 'table_b', 'table_c'];
      const dependencies = new Map<string, string[]>([
        ['table_a', ['table_c']],
        ['table_b', ['table_a']],
        ['table_c', ['table_b']],
      ]);

      // Should complete without throwing (logs warning)
      const sorted = topologicalSort(tables, dependencies);

      // All tables should be in result
      assert.strictEqual(sorted.length, 3);
      assert.ok(sorted.includes('table_a'));
      assert.ok(sorted.includes('table_b'));
      assert.ok(sorted.includes('table_c'));
    });

    it('should handle self-referential dependency (A←A)', () => {
      // Table A has FK to itself (e.g., categories.parent_id → categories.id)
      const tables = ['table_a'];
      const dependencies = new Map<string, string[]>([['table_a', ['table_a']]]);

      const sorted = topologicalSort(tables, dependencies);

      // Should include table once
      assert.strictEqual(sorted.length, 1);
      assert.strictEqual(sorted[0], 'table_a');
    });

    it('should handle disconnected graphs (independent tables)', () => {
      // A←B  C←D (two separate chains)
      const tables = ['table_a', 'table_b', 'table_c', 'table_d'];
      const dependencies = new Map<string, string[]>([
        ['table_a', []],
        ['table_b', ['table_a']],
        ['table_c', []],
        ['table_d', ['table_c']],
      ]);

      const sorted = topologicalSort(tables, dependencies);

      // All tables should be present
      assert.strictEqual(sorted.length, 4);

      // Dependencies should be respected within each chain
      const indexA = sorted.indexOf('table_a');
      const indexB = sorted.indexOf('table_b');
      const indexC = sorted.indexOf('table_c');
      const indexD = sorted.indexOf('table_d');

      assert.ok(indexA < indexB, 'A should come before B');
      assert.ok(indexC < indexD, 'C should come before D');
    });

    it('should handle complex multi-dependency graph', () => {
      //     A
      //    / \
      //   B   C
      //   |\ /|
      //   | X |
      //   |/ \|
      //   D   E
      //    \ /
      //     F
      const tables = ['table_a', 'table_b', 'table_c', 'table_d', 'table_e', 'table_f'];
      const dependencies = new Map<string, string[]>([
        ['table_a', []],
        ['table_b', ['table_a']],
        ['table_c', ['table_a']],
        ['table_d', ['table_b', 'table_c']],
        ['table_e', ['table_b', 'table_c']],
        ['table_f', ['table_d', 'table_e']],
      ]);

      const sorted = topologicalSort(tables, dependencies);

      const indices = new Map(sorted.map((t, i) => [t, i]));

      // A must come first
      assert.ok(indices.get('table_a')! < indices.get('table_b')!);
      assert.ok(indices.get('table_a')! < indices.get('table_c')!);

      // B and C before D and E
      assert.ok(indices.get('table_b')! < indices.get('table_d')!);
      assert.ok(indices.get('table_b')! < indices.get('table_e')!);
      assert.ok(indices.get('table_c')! < indices.get('table_d')!);
      assert.ok(indices.get('table_c')! < indices.get('table_e')!);

      // D and E before F
      assert.ok(indices.get('table_d')! < indices.get('table_f')!);
      assert.ok(indices.get('table_e')! < indices.get('table_f')!);
    });
  });

  describe('getTableDependencies() - SQLite Integration', () => {
    let db: Knex;

    it('should extract FK dependencies from SQLite schema', async () => {
      const config = getDbConfig('sqlite', TEST_DB_PATH);
      db = await connectDb(config);

      // Create test schema with FK relationships
      await db.schema.createTable('m_projects', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
      });

      await db.schema.createTable('v4_users', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().notNullable();
        table.foreign('project_id').references('m_projects.id');
      });

      await db.schema.createTable('v4_posts', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.foreign('user_id').references('v4_users.id');
      });

      // Extract dependencies
      const tables = ['m_projects', 'v4_users', 'v4_posts'];
      const dependencies = await getTableDependencies(db, tables);

      // Verify dependencies
      assert.deepStrictEqual(dependencies.get('m_projects'), []);
      assert.deepStrictEqual(dependencies.get('v4_users'), ['m_projects']);
      assert.deepStrictEqual(dependencies.get('v4_posts'), ['v4_users']);

      // Clean up
      await disconnectDb(db);
    });

    it('should handle self-referential FK (categories example)', async () => {
      const config = getDbConfig('sqlite', TEST_DB_PATH);
      db = await connectDb(config);

      // Categories table with parent_id self-reference
      await db.schema.createTable('categories', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('parent_id').unsigned().nullable();
        table.foreign('parent_id').references('categories.id');
      });

      const tables = ['categories'];
      const dependencies = await getTableDependencies(db, tables);

      // Self-references are intentionally filtered out (don't affect sort order)
      assert.deepStrictEqual(dependencies.get('categories'), []);

      await disconnectDb(db);
    });

    it('should handle tables with no FKs', async () => {
      const config = getDbConfig('sqlite', TEST_DB_PATH);
      db = await connectDb(config);

      await db.schema.createTable('standalone_table', (table) => {
        table.increments('id').primary();
        table.string('data');
      });

      const tables = ['standalone_table'];
      const dependencies = await getTableDependencies(db, tables);

      assert.deepStrictEqual(dependencies.get('standalone_table'), []);

      await disconnectDb(db);
    });

    it('should ignore FKs to tables not in the list', async () => {
      const config = getDbConfig('sqlite', TEST_DB_PATH);
      db = await connectDb(config);

      await db.schema.createTable('external_table', (table) => {
        table.increments('id').primary();
      });

      await db.schema.createTable('my_table', (table) => {
        table.increments('id').primary();
        table.integer('external_id').unsigned();
        table.foreign('external_id').references('external_table.id');
      });

      // Only include my_table in the list
      const tables = ['my_table'];
      const dependencies = await getTableDependencies(db, tables);

      // FK to external_table should be ignored
      assert.deepStrictEqual(dependencies.get('my_table'), []);

      await disconnectDb(db);
    });
  });

  describe('End-to-End Sorting with Real Schema', () => {
    // ⚠️ MAINTENANCE REQUIRED: Update this test when adding new tables or FK relationships
    // This test validates dependency order using the REAL production schema
    it('should correctly sort mcp-sqlew schema tables', async () => {
      // Use separate database for migration test to avoid conflicts
      const E2E_DB_PATH = `.tmp-test/table-ordering-e2e-${Date.now()}.db`;
      const config = getDbConfig('sqlite', E2E_DB_PATH);
      const db = await connectDb(config);

      // Run migrations to get real schema
      await db.migrate.latest();

      // Get all tables
      const result = await db.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
        ORDER BY name
      `);

      const tables = result.map((r: any) => r.name);

      // Extract dependencies
      const dependencies = await getTableDependencies(db, tables);

      // Sort topologically
      const sorted = topologicalSort(tables, dependencies);

      // Verify master tables come before transaction tables
      // ⚠️ ADD NEW ASSERTIONS HERE when adding tables with FK dependencies
      const projectsIndex = sorted.indexOf('m_projects');
      const decisionsIndex = sorted.indexOf('t_decisions');
      const constraintsIndex = sorted.indexOf('t_constraints');

      assert.ok(projectsIndex < decisionsIndex, 'm_projects should come before t_decisions');
      assert.ok(projectsIndex < constraintsIndex, 'm_projects should come before t_constraints');

      await disconnectDb(db);
    });
  });
});
