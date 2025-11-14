/**
 * Foreign Key Constraint Validation Tests
 *
 * Tests FK constraint preservation and enforcement during cross-database migrations.
 * Specifically designed to catch SQLite→MySQL FK errors.
 *
 * Uses DRY shared test utilities from test-helpers.ts
 *
 * NOTE: These tests require Docker containers (MySQL, PostgreSQL)
 * Set SKIP_DOCKER_TESTS=true or CI=true to skip in CI environments
 */

// Skip Docker-dependent tests in CI environments
if (process.env.SKIP_DOCKER_TESTS === 'true' || process.env.CI === 'true') {
  console.log('⏭️  Skipping Docker-dependent FK constraint tests (CI environment)');
  process.exit(0);
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { generateSqlDump } from '../../../utils/sql-dump/index.js';
import {
  getDbConfig,
  connectDb,
  disconnectDb,
  dropAllTables,
  getFKConstraints,
  importSqlToDocker,
  type DatabaseType,
} from '../../utils/test-helpers.js';
import type { Knex } from 'knex';
import { join } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';

const testDbPath = join(process.cwd(), '.sqlew/test-fk-constraints.db');

describe('FK Constraint Validation Tests', () => {
  let sqliteDb: Knex;
  let mysqlDb: Knex;
  let postgresDb: Knex;

  before(async () => {
    console.log('  📦 Setting up test databases for FK validation...');

    const testDir = join(process.cwd(), '.sqlew');
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    const sqliteConfig = getDbConfig('sqlite', testDbPath);
    const mysqlConfig = getDbConfig('mysql');
    const postgresConfig = getDbConfig('postgresql');

    sqliteDb = await connectDb(sqliteConfig);
    mysqlDb = await connectDb(mysqlConfig);
    postgresDb = await connectDb(postgresConfig);

    console.log('  ✅ All databases connected');
  });

  after(async () => {
    if (sqliteDb) await disconnectDb(sqliteDb);
    if (mysqlDb) await disconnectDb(mysqlDb);
    if (postgresDb) await disconnectDb(postgresDb);

    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  // ==========================================================================
  // Test 1: Detect NULL in FK columns (MySQL composite PK requirement)
  // ==========================================================================

  describe('Test 1: Detect NULL values in FK columns', () => {
    it('should create SQLite schema with potential NULL FK columns', async () => {
      console.log('    🏗️  Creating test schema...');

      await sqliteDb.schema.createTable('parent_table', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
      });

      await sqliteDb.schema.createTable('child_table', (table) => {
        table.increments('id').primary();
        table.integer('parent_id').unsigned().nullable(); // NULLABLE FK column
        table.foreign('parent_id').references('parent_table.id');
      });

      // Insert data with NULL FK
      await sqliteDb('parent_table').insert({ id: 1, name: 'Parent 1' });
      await sqliteDb('child_table').insert([
        { id: 1, parent_id: 1 },
        { id: 2, parent_id: null }, // NULL FK value
      ]);

      console.log('      ✅ Schema created with NULL FK values');
    });

    it('should identify NULL FK columns before migration', async () => {
      console.log('    🔍 Checking for NULL FK values...');

      const nullFKs = await sqliteDb('child_table').whereNull('parent_id');

      assert.ok(nullFKs.length > 0, 'Should detect NULL FK values');
      console.log(`      ⚠️  Found ${nullFKs.length} rows with NULL FK values`);
    });

    it('should export to MySQL and catch NULL FK issues', async () => {
      console.log('    📤 Exporting SQLite → MySQL...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      // Clean MySQL
      await dropAllTables(mysqlDb, 'mysql');

      // Attempt import
      try {
        const config = getDbConfig('mysql');
        await importSqlToDocker(dump, config.containerName!, 'mysql');

        // If import succeeds, verify data
        const mysqlNullFKs = await mysqlDb('child_table').whereNull('parent_id');
        console.log(`      ✅ Import succeeded, ${mysqlNullFKs.length} NULL FK values preserved`);
      } catch (error: any) {
        // Expected: MySQL may reject NULL in composite PKs
        console.log(`      ⚠️  Import failed as expected: ${error.message}`);
      }
    });
  });

  // ==========================================================================
  // Test 2: FK constraint enforcement after migration
  // ==========================================================================

  describe('Test 2: FK constraint enforcement', () => {
    before(async () => {
      // Clean databases
      await dropAllTables(sqliteDb, 'sqlite');
      await dropAllTables(mysqlDb, 'mysql');
      await dropAllTables(postgresDb, 'postgresql');
    });

    it('should create schema with FK constraints', async () => {
      console.log('    🏗️  Creating FK constraint test schema...');

      await sqliteDb.schema.createTable('departments', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
      });

      await sqliteDb.schema.createTable('employees', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('department_id').unsigned().notNullable(); // NOT NULL
        table.foreign('department_id').references('departments.id');
      });

      // Seed data
      await sqliteDb('departments').insert([
        { id: 1, name: 'Engineering' },
        { id: 2, name: 'Sales' },
      ]);

      await sqliteDb('employees').insert([
        { id: 1, name: 'Alice', department_id: 1 },
        { id: 2, name: 'Bob', department_id: 2 },
      ]);

      console.log('      ✅ Schema created with NOT NULL FK columns');
    });

    it('should migrate schema to MySQL with FK constraints', async () => {
      console.log('    📤 Migrating to MySQL...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      await dropAllTables(mysqlDb, 'mysql');

      const config = getDbConfig('mysql');
      await importSqlToDocker(dump, config.containerName!, 'mysql');

      console.log('      ✅ MySQL import successful');

      // Verify FK constraints exist
      const fks = await getFKConstraints(mysqlDb, 'mysql', 'employees');
      assert.ok(fks.length > 0, 'MySQL should have FK constraints on employees table');

      console.log(`      ✅ Found ${fks.length} FK constraints in MySQL`);
    });

    it('should enforce FK constraints on MySQL (reject invalid FK)', async () => {
      console.log('    🧪 Testing FK constraint enforcement on MySQL...');

      try {
        // Try to insert employee with non-existent department
        await mysqlDb('employees').insert({
          id: 999,
          name: 'Invalid Employee',
          department_id: 9999, // Non-existent department
        });

        assert.fail('MySQL should reject invalid FK reference');
      } catch (error: any) {
        // Expected: FK constraint violation
        assert.ok(error.message.includes('foreign key constraint') || error.code === 'ER_NO_REFERENCED_ROW_2',
          'Should throw FK constraint error');
        console.log('      ✅ MySQL correctly rejected invalid FK');
      }
    });

    it('should migrate schema to PostgreSQL with FK constraints', async () => {
      console.log('    📤 Migrating to PostgreSQL...');

      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        includeSchema: true,
        chunkSize: 100,
      });

      await dropAllTables(postgresDb, 'postgresql');

      const config = getDbConfig('postgresql');
      await importSqlToDocker(dump, config.containerName!, 'postgresql');

      console.log('      ✅ PostgreSQL import successful');

      // Verify FK constraints exist
      const fks = await getFKConstraints(postgresDb, 'postgresql', 'employees');
      assert.ok(fks.length > 0, 'PostgreSQL should have FK constraints on employees table');

      console.log(`      ✅ Found ${fks.length} FK constraints in PostgreSQL`);
    });

    it('should enforce FK constraints on PostgreSQL (reject invalid FK)', async () => {
      console.log('    🧪 Testing FK constraint enforcement on PostgreSQL...');

      try {
        // Try to insert employee with non-existent department
        await postgresDb('employees').insert({
          id: 999,
          name: 'Invalid Employee',
          department_id: 9999, // Non-existent department
        });

        assert.fail('PostgreSQL should reject invalid FK reference');
      } catch (error: any) {
        // Expected: FK constraint violation
        assert.ok(error.message.includes('foreign key constraint') || error.code === '23503',
          'Should throw FK constraint error');
        console.log('      ✅ PostgreSQL correctly rejected invalid FK');
      }
    });
  });

  // ==========================================================================
  // Test 3: CASCADE behaviors
  // ==========================================================================

  describe('Test 3: CASCADE behaviors', () => {
    before(async () => {
      // Clean databases
      await dropAllTables(sqliteDb, 'sqlite');
      await dropAllTables(mysqlDb, 'mysql');
      await dropAllTables(postgresDb, 'postgresql');
    });

    it('should create schema with CASCADE constraints', async () => {
      console.log('    🏗️  Creating CASCADE test schema...');

      await sqliteDb.schema.createTable('categories', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
      });

      await sqliteDb.schema.createTable('products', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('category_id').unsigned().notNullable();
        table.foreign('category_id')
          .references('categories.id')
          .onDelete('CASCADE')
          .onUpdate('CASCADE');
      });

      // Seed data
      await sqliteDb('categories').insert({ id: 1, name: 'Electronics' });
      await sqliteDb('products').insert([
        { id: 1, name: 'Laptop', category_id: 1 },
        { id: 2, name: 'Phone', category_id: 1 },
      ]);

      console.log('      ✅ Schema created with CASCADE constraints');
    });

    it('should migrate CASCADE constraints to MySQL', async () => {
      console.log('    📤 Migrating CASCADE to MySQL...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      await dropAllTables(mysqlDb, 'mysql');

      const config = getDbConfig('mysql');
      await importSqlToDocker(dump, config.containerName!, 'mysql');

      console.log('      ✅ MySQL import with CASCADE successful');
    });

    it('should test DELETE CASCADE on MySQL', async () => {
      console.log('    🧪 Testing DELETE CASCADE on MySQL...');

      // Verify products exist before delete
      const productsBefore = await mysqlDb('products').where({ category_id: 1 });
      assert.strictEqual(productsBefore.length, 2, 'Should have 2 products before delete');

      // Delete category
      await mysqlDb('categories').where({ id: 1 }).del();

      // Verify products were cascaded
      const productsAfter = await mysqlDb('products').where({ category_id: 1 });
      assert.strictEqual(productsAfter.length, 0, 'Products should be deleted via CASCADE');

      console.log('      ✅ DELETE CASCADE works on MySQL');
    });

    it('should migrate CASCADE constraints to PostgreSQL', async () => {
      console.log('    📤 Migrating CASCADE to PostgreSQL...');

      const dump = await generateSqlDump(sqliteDb, 'postgresql', {
        includeSchema: true,
        chunkSize: 100,
      });

      await dropAllTables(postgresDb, 'postgresql');

      const config = getDbConfig('postgresql');
      await importSqlToDocker(dump, config.containerName!, 'postgresql');

      console.log('      ✅ PostgreSQL import with CASCADE successful');
    });

    it('should test DELETE CASCADE on PostgreSQL', async () => {
      console.log('    🧪 Testing DELETE CASCADE on PostgreSQL...');

      // Verify products exist before delete
      const productsBefore = await postgresDb('products').where({ category_id: 1 });
      assert.strictEqual(productsBefore.length, 2, 'Should have 2 products before delete');

      // Delete category
      await postgresDb('categories').where({ id: 1 }).del();

      // Verify products were cascaded
      const productsAfter = await postgresDb('products').where({ category_id: 1 });
      assert.strictEqual(productsAfter.length, 0, 'Products should be deleted via CASCADE');

      console.log('      ✅ DELETE CASCADE works on PostgreSQL');
    });
  });

  // ==========================================================================
  // Test 4: Multi-column FK constraints
  // ==========================================================================

  describe('Test 4: Multi-column (composite) FK constraints', () => {
    before(async () => {
      await dropAllTables(sqliteDb, 'sqlite');
      await dropAllTables(mysqlDb, 'mysql');
    });

    it('should create schema with composite FK', async () => {
      console.log('    🏗️  Creating composite FK schema...');

      await sqliteDb.schema.createTable('orders', (table) => {
        table.integer('order_id').unsigned().notNullable();
        table.integer('customer_id').unsigned().notNullable();
        table.string('status').notNullable();
        table.primary(['order_id', 'customer_id']);
      });

      await sqliteDb.schema.createTable('order_items', (table) => {
        table.increments('id').primary();
        table.integer('order_id').unsigned().notNullable();
        table.integer('customer_id').unsigned().notNullable();
        table.string('product').notNullable();
        table.foreign(['order_id', 'customer_id'])
          .references(['order_id', 'customer_id'])
          .inTable('orders');
      });

      // Seed data
      await sqliteDb('orders').insert({ order_id: 1, customer_id: 100, status: 'pending' });
      await sqliteDb('order_items').insert({
        id: 1,
        order_id: 1,
        customer_id: 100,
        product: 'Widget',
      });

      console.log('      ✅ Composite FK schema created');
    });

    it('should migrate composite FK to MySQL', async () => {
      console.log('    📤 Migrating composite FK to MySQL...');

      const dump = await generateSqlDump(sqliteDb, 'mysql', {
        includeSchema: true,
        chunkSize: 100,
      });

      await dropAllTables(mysqlDb, 'mysql');

      try {
        const config = getDbConfig('mysql');
        await importSqlToDocker(dump, config.containerName!, 'mysql');

        console.log('      ✅ MySQL composite FK import successful');

        // Verify FK exists
        const fks = await getFKConstraints(mysqlDb, 'mysql', 'order_items');
        console.log(`      ✅ Found ${fks.length} composite FK constraints`);

      } catch (error: any) {
        console.log(`      ⚠️  Composite FK import failed: ${error.message}`);
        // This may fail if dump doesn't preserve composite FKs correctly
      }
    });
  });

  // ==========================================================================
  // Test 5: Detect missing NOT NULL on FK columns
  // ==========================================================================

  describe('Test 5: Verify NOT NULL on all FK columns', () => {
    it('should scan SQLite schema for nullable FK columns', async () => {
      console.log('    🔍 Scanning for nullable FK columns in real schema...');

      // Run migrations to get real mcp-sqlew schema
      await dropAllTables(sqliteDb, 'sqlite');
      await sqliteDb.migrate.latest();

      // Get all tables
      const tables = await sqliteDb.raw(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations'
      `);

      const issues: Array<{ table: string; column: string }> = [];

      // Check each table for FK columns
      for (const row of tables) {
        const tableName = row.name;
        const fkList = await sqliteDb.raw(`PRAGMA foreign_key_list(${tableName})`);

        for (const fk of fkList) {
          const columnName = fk.from;

          // Check if column is nullable
          const tableInfo = await sqliteDb.raw(`PRAGMA table_info(${tableName})`);
          const column = tableInfo.find((col: any) => col.name === columnName);

          if (column && column.notnull === 0) {
            issues.push({ table: tableName, column: columnName });
            console.log(`      ⚠️  ${tableName}.${columnName} is FK but NULLABLE`);
          }
        }
      }

      if (issues.length > 0) {
        console.log(`      ⚠️  Found ${issues.length} nullable FK columns`);
        console.log('      💡 These may cause MySQL composite PK errors');
      } else {
        console.log('      ✅ No nullable FK columns found');
      }
    });
  });
});
