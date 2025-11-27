/**
 * DEFAULT value conversion tests for CREATE TABLE statements
 *
 * Tests that SQLite DEFAULT functions are correctly converted to target database syntax.
 * Focus: INTEGER timestamp defaults (strftime('%s', 'now') → UNIX_TIMESTAMP() / EXTRACT(epoch...))
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import knex from 'knex';
import { generateSqlDump } from '../../../utils/sql-dump/index.js';

describe('SQL Dump DEFAULT Value Conversions', () => {

  describe('INTEGER Timestamp Defaults', () => {
    it('should convert strftime(\'%s\', \'now\') to UNIX_TIMESTAMP() for MySQL', async () => {
      // Create in-memory SQLite database with INTEGER timestamp DEFAULT
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('v4_help_token_usage', (table) => {
        table.increments('usage_id').primary();
        table.text('query_type').notNullable();
        table.integer('estimated_tokens').notNullable();
        // SQLite INTEGER timestamp with strftime DEFAULT (requires parentheses)
        table.integer('timestamp').notNullable().defaultTo(db.raw("(strftime('%s', 'now'))"));
      });

      // Generate MySQL dump
      const dump = await generateSqlDump(db, 'mysql', {
        tables: ['v4_help_token_usage'],
        includeSchema: true,
      });

      // Verify conversion
      assert.ok(dump.includes('UNIX_TIMESTAMP()'), 'Should convert to UNIX_TIMESTAMP()');
      assert.ok(!dump.includes('strftime'), 'Should not contain strftime');
      assert.ok(!dump.includes('NOW()'), 'Should not use NOW() for integer timestamps');

      await db.destroy();
    });

    it('should convert strftime(\'%s\', \'now\') to EXTRACT(epoch FROM NOW())::INTEGER for PostgreSQL', async () => {
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('v4_help_token_usage', (table) => {
        table.increments('usage_id').primary();
        table.text('query_type').notNullable();
        table.integer('estimated_tokens').notNullable();
        table.integer('timestamp').notNullable().defaultTo(db.raw("(strftime('%s', 'now'))"));
      });

      const dump = await generateSqlDump(db, 'postgresql', {
        tables: ['v4_help_token_usage'],
        includeSchema: true,
      });

      // Verify conversion
      assert.ok(dump.includes('EXTRACT(epoch FROM NOW())::INTEGER'), 'Should convert to EXTRACT with INTEGER cast');
      assert.ok(!dump.includes('strftime'), 'Should not contain strftime');
      assert.ok(!dump.includes('NOW()') || dump.includes('EXTRACT(epoch FROM NOW())'),
        'Should not use bare NOW() for integer timestamps');

      await db.destroy();
    });

    it('should convert unixepoch() to UNIX_TIMESTAMP() for MySQL', async () => {
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('t_test', (table) => {
        table.increments('id').primary();
        table.integer('created_at').defaultTo(db.raw('(unixepoch())'));
      });

      const dump = await generateSqlDump(db, 'mysql', {
        tables: ['t_test'],
        includeSchema: true,
      });

      assert.ok(dump.includes('UNIX_TIMESTAMP()'), 'Should convert unixepoch() to UNIX_TIMESTAMP()');
      assert.ok(!dump.includes('unixepoch'), 'Should not contain unixepoch');

      await db.destroy();
    });

    it('should convert unixepoch() to EXTRACT(epoch FROM NOW())::INTEGER for PostgreSQL', async () => {
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('t_test', (table) => {
        table.increments('id').primary();
        table.integer('created_at').defaultTo(db.raw('(unixepoch())'));
      });

      const dump = await generateSqlDump(db, 'postgresql', {
        tables: ['t_test'],
        includeSchema: true,
      });

      assert.ok(dump.includes('EXTRACT(epoch FROM NOW())::INTEGER'),
        'Should convert unixepoch() to EXTRACT with INTEGER cast');
      assert.ok(!dump.includes('unixepoch'), 'Should not contain unixepoch');

      await db.destroy();
    });
  });

  describe('Datetime Defaults (Non-Integer)', () => {
    it('should skip DEFAULT for TEXT columns in MySQL (TEXT cannot have DEFAULT)', async () => {
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('t_test', (table) => {
        table.increments('id').primary();
        table.text('created_at').defaultTo(db.raw("(strftime('%Y-%m-%d %H:%M:%S', 'now'))"));
      });

      const dump = await generateSqlDump(db, 'mysql', {
        tables: ['t_test'],
        includeSchema: true,
      });

      // MySQL TEXT columns cannot have DEFAULT values, so it should be skipped
      // Check that created_at column does not have DEFAULT (ignore DEFAULT CHARSET)
      const createdAtLine = dump.split('\n').find(line => line.includes('created_at'));
      assert.ok(createdAtLine, 'Should have created_at column');
      assert.ok(!createdAtLine.includes('DEFAULT'), 'created_at column should not have DEFAULT');
      assert.ok(!dump.includes('strftime'), 'Should not contain strftime');
      assert.ok(!dump.includes('NOW()'), 'Should not use NOW() for TEXT columns');

      await db.destroy();
    });

    it('should convert strftime datetime formats to NOW() for PostgreSQL', async () => {
      const db = knex({
        client: 'better-sqlite3',
        connection: ':memory:',
        useNullAsDefault: true,
      });

      await db.schema.createTable('t_test', (table) => {
        table.increments('id').primary();
        table.text('created_at').defaultTo(db.raw("(strftime('%Y-%m-%d', 'now'))"));
      });

      const dump = await generateSqlDump(db, 'postgresql', {
        tables: ['t_test'],
        includeSchema: true,
      });

      assert.ok(dump.includes('NOW()'), 'Should convert datetime strftime to NOW()');
      assert.ok(!dump.includes('strftime'), 'Should not contain strftime');

      await db.destroy();
    });
  });
});
