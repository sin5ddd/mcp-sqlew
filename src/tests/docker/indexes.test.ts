/**
 * Tests for index export functionality across MySQL, PostgreSQL, and SQLite
 *
 * Tests index detection, CREATE INDEX statement generation, and cross-database
 * conversion including MySQL prefix length handling.
 *
 * Prerequisites:
 * - Docker installed and running
 * - Run: docker-compose -f docker/docker-compose.test.yml up -d
 */

import knex, { Knex } from 'knex';
import { getAllIndexes, getCreateIndexStatement } from '../../utils/sql-dump/index.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getTestConfig } from '../database/testing-config.js';

// Test database configurations (using centralized config)
const configs = {
  sqlite: getTestConfig('sqlite'),
  postgresql: getTestConfig('postgresql'),
  mysql: getTestConfig('mysql'),
};

// Override SQLite to use in-memory database for this test
configs.sqlite.connection = { filename: ':memory:' };

describe('Index Export Tests', () => {
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

  describe('MySQL Index Export', () => {
    before(async () => {
      // Clean up any existing test tables
      await mysqlDb.raw('DROP TABLE IF EXISTS test_users');
      await mysqlDb.raw('DROP TABLE IF EXISTS test_products');

      // Create test table with indexes
      await mysqlDb.raw(`
        CREATE TABLE test_users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          email VARCHAR(255) NOT NULL,
          username VARCHAR(100) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create simple index
      await mysqlDb.raw('CREATE INDEX idx_email ON test_users (email)');

      // Create unique index
      await mysqlDb.raw('CREATE UNIQUE INDEX idx_username ON test_users (username)');

      // Create multi-column index
      await mysqlDb.raw('CREATE INDEX idx_email_username ON test_users (email, username)');

      // Create table with long VARCHAR for prefix length testing
      await mysqlDb.raw(`
        CREATE TABLE test_products (
          id INT PRIMARY KEY AUTO_INCREMENT,
          long_description VARCHAR(500),
          short_name VARCHAR(50)
        )
      `);

      // Create index on long VARCHAR (should require prefix length)
      await mysqlDb.raw('CREATE INDEX idx_long_desc ON test_products (long_description(191))');
    });

    after(async () => {
      // Clean up test tables
      await mysqlDb.raw('DROP TABLE IF EXISTS test_users');
      await mysqlDb.raw('DROP TABLE IF EXISTS test_products');
    });

    it('should detect MySQL indexes (excluding PRIMARY)', async () => {
      const indexes = await getAllIndexes(mysqlDb, 'test_users');

      assert.ok(indexes.length >= 3, 'Should find at least 3 indexes');
      assert.ok(indexes.includes('idx_email'), 'Should find idx_email');
      assert.ok(indexes.includes('idx_username'), 'Should find idx_username');
      assert.ok(indexes.includes('idx_email_username'), 'Should find idx_email_username');
      assert.ok(!indexes.includes('PRIMARY'), 'Should not include PRIMARY key');
    });

    it('should generate CREATE INDEX for simple MySQL index', async () => {
      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_email', 'mysql');

      assert.ok(createSql.includes('CREATE INDEX'), 'Should contain CREATE INDEX');
      assert.ok(createSql.includes('idx_email'), 'Should contain index name');
      assert.ok(createSql.includes('test_users'), 'Should contain table name');
      assert.ok(createSql.includes('email'), 'Should contain column name');
      assert.ok(createSql.endsWith(';'), 'Should end with semicolon');
    });

    it('should generate CREATE UNIQUE INDEX for unique MySQL index', async () => {
      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_username', 'mysql');

      assert.ok(createSql.includes('CREATE UNIQUE INDEX'), 'Should contain CREATE UNIQUE INDEX');
      assert.ok(createSql.includes('idx_username'), 'Should contain index name');
      assert.ok(createSql.includes('username'), 'Should contain column name');
    });

    it('should generate multi-column index', async () => {
      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_email_username', 'mysql');

      assert.ok(createSql.includes('email'), 'Should contain email column');
      assert.ok(createSql.includes('username'), 'Should contain username column');
    });

    it('should handle prefix length for long VARCHAR columns', async () => {
      const indexes = await getAllIndexes(mysqlDb, 'test_products');
      assert.ok(indexes.includes('idx_long_desc'), 'Should find idx_long_desc');

      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_long_desc', 'mysql');

      assert.ok(createSql.includes('(191)'), 'Should include prefix length for long VARCHAR');
      assert.ok(createSql.includes('long_description'), 'Should contain column name');
    });

    it('should convert MySQL index to PostgreSQL format', async () => {
      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_email', 'postgresql');

      // PostgreSQL uses double quotes instead of backticks
      assert.ok(createSql.includes('"') || !createSql.includes('`'), 'Should not contain MySQL backticks');
      assert.ok(createSql.includes('idx_email'), 'Should contain index name');
    });

    it('should convert MySQL index to SQLite format', async () => {
      const createSql = await getCreateIndexStatement(mysqlDb, 'idx_long_desc', 'sqlite');

      // SQLite doesn't support prefix lengths
      assert.ok(!createSql.includes('(191)'), 'Should not include prefix length for SQLite');
      assert.ok(createSql.includes('long_description'), 'Should contain column name');
    });

    it('should handle PRIMARY KEY with long VARCHAR (prefix length bug fix)', async () => {
      // Test the PRIMARY KEY prefix length bug fix
      // Create a table with long VARCHAR in PRIMARY KEY
      await mysqlDb.raw('DROP TABLE IF EXISTS test_pk_prefix');
      await mysqlDb.raw(`
        CREATE TABLE test_pk_prefix (
          long_key VARCHAR(500) PRIMARY KEY,
          value TEXT
        )
      `);

      try {
        // Export table definition to MySQL (should apply prefix length)
        const { generateSqlDump } = await import('../../utils/sql-dump/index.js');
        const dump = await generateSqlDump(mysqlDb, 'mysql', {
          tables: ['test_pk_prefix'],
          includeSchema: true,
          chunkSize: 0, // Schema only
        });

        // Verify PRIMARY KEY has prefix length applied
        assert.ok(dump.includes('`long_key`(191)'), 'Should apply prefix length to long VARCHAR in PRIMARY KEY');
        assert.ok(dump.includes('PRIMARY KEY'), 'Should contain PRIMARY KEY constraint');
      } finally {
        await mysqlDb.raw('DROP TABLE IF EXISTS test_pk_prefix');
      }
    });
  });

  describe('PostgreSQL Index Export', () => {
    before(async () => {
      // Clean up any existing test tables
      await postgresDb.raw('DROP TABLE IF EXISTS test_posts CASCADE');

      // Create test table with indexes
      await postgresDb.raw(`
        CREATE TABLE test_posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(200) NOT NULL,
          content TEXT,
          author_id INTEGER,
          published_at TIMESTAMP
        )
      `);

      // Create simple index
      await postgresDb.raw('CREATE INDEX idx_title ON test_posts (title)');

      // Create unique index
      await postgresDb.raw('CREATE UNIQUE INDEX idx_author_title ON test_posts (author_id, title)');
    });

    after(async () => {
      // Clean up test tables
      await postgresDb.raw('DROP TABLE IF EXISTS test_posts CASCADE');
    });

    it('should detect PostgreSQL indexes (excluding PRIMARY)', async () => {
      const indexes = await getAllIndexes(postgresDb, 'test_posts');

      assert.ok(indexes.length >= 2, 'Should find at least 2 indexes');
      assert.ok(indexes.includes('idx_title'), 'Should find idx_title');
      assert.ok(indexes.includes('idx_author_title'), 'Should find idx_author_title');
      assert.ok(!indexes.some(idx => idx.includes('pkey')), 'Should not include primary key');
    });

    it('should generate CREATE INDEX for PostgreSQL index', async () => {
      const createSql = await getCreateIndexStatement(postgresDb, 'idx_title', 'postgresql');

      assert.ok(createSql.includes('CREATE INDEX'), 'Should contain CREATE INDEX');
      assert.ok(createSql.includes('idx_title'), 'Should contain index name');
      assert.ok(createSql.includes('test_posts'), 'Should contain table name');
      assert.ok(createSql.includes('title'), 'Should contain column name');
      assert.ok(createSql.endsWith(';'), 'Should end with semicolon');
    });

    it('should generate CREATE UNIQUE INDEX for unique PostgreSQL index', async () => {
      const createSql = await getCreateIndexStatement(postgresDb, 'idx_author_title', 'postgresql');

      assert.ok(createSql.includes('UNIQUE'), 'Should contain UNIQUE');
      assert.ok(createSql.includes('idx_author_title'), 'Should contain index name');
    });

    it('should convert PostgreSQL index to MySQL format', async () => {
      const createSql = await getCreateIndexStatement(postgresDb, 'idx_title', 'mysql');

      // MySQL uses backticks instead of double quotes
      assert.ok(createSql.includes('`') || !createSql.includes('"'), 'Should use MySQL backticks');
      assert.ok(createSql.includes('idx_title'), 'Should contain index name');
    });

    it('should convert PostgreSQL index to SQLite format', async () => {
      const createSql = await getCreateIndexStatement(postgresDb, 'idx_title', 'sqlite');

      assert.ok(createSql.includes('idx_title'), 'Should contain index name');
      assert.ok(createSql.endsWith(';'), 'Should end with semicolon');
    });
  });

  describe('SQLite Index Export', () => {
    before(async () => {
      // Create test table with indexes
      await sqliteDb.raw(`
        CREATE TABLE test_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL,
          category TEXT,
          views INTEGER DEFAULT 0
        )
      `);

      // Create simple index
      await sqliteDb.raw('CREATE INDEX idx_slug ON test_articles (slug)');

      // Create unique index
      await sqliteDb.raw('CREATE UNIQUE INDEX idx_unique_slug ON test_articles (slug, category)');
    });

    it('should detect SQLite indexes', async () => {
      const indexes = await getAllIndexes(sqliteDb, 'test_articles');

      assert.ok(indexes.length >= 2, 'Should find at least 2 indexes');
      assert.ok(indexes.includes('idx_slug'), 'Should find idx_slug');
      assert.ok(indexes.includes('idx_unique_slug'), 'Should find idx_unique_slug');
    });

    it('should generate CREATE INDEX for SQLite index', async () => {
      const createSql = await getCreateIndexStatement(sqliteDb, 'idx_slug', 'sqlite');

      assert.ok(createSql.includes('CREATE INDEX'), 'Should contain CREATE INDEX');
      assert.ok(createSql.includes('idx_slug'), 'Should contain index name');
      assert.ok(createSql.endsWith(';'), 'Should end with semicolon');
    });

    it('should convert SQLite index to MySQL format', async () => {
      const createSql = await getCreateIndexStatement(sqliteDb, 'idx_slug', 'mysql');

      assert.ok(createSql.includes('`'), 'Should use MySQL backticks');
      assert.ok(createSql.includes('idx_slug'), 'Should contain index name');
    });

    it('should convert SQLite index to PostgreSQL format', async () => {
      const createSql = await getCreateIndexStatement(sqliteDb, 'idx_slug', 'postgresql');

      assert.ok(createSql.includes('"') || !createSql.includes('`'), 'Should use PostgreSQL quotes');
      assert.ok(createSql.includes('idx_slug'), 'Should contain index name');
    });
  });
});
