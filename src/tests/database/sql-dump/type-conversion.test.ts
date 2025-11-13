/**
 * Type-aware value conversion tests
 *
 * Tests enhanced convertValueWithType() with Knex columnInfo() support
 * for accurate cross-database type conversions.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { generateBulkInsert } from '../utils/sql-dump.js';
import type { DatabaseFormat } from '../utils/sql-dump.js';

describe('Type-Aware Value Conversion', () => {
  describe('Boolean Conversion', () => {
    it('should convert SQLite 0/1 to PostgreSQL TRUE/FALSE', () => {
      const rows = [
        { id: 1, is_active: 1, is_deleted: 0 }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['is_active', { type: 'boolean' }],
        ['is_deleted', { type: 'boolean' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('TRUE'), 'Should convert 1 to TRUE');
      assert.ok(result[0].includes('FALSE'), 'Should convert 0 to FALSE');
    });

    it('should convert PostgreSQL boolean to MySQL 0/1', () => {
      const rows = [
        { id: 1, is_active: true, is_deleted: false }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['is_active', { type: 'tinyint' }],
        ['is_deleted', { type: 'tinyint' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('1'), 'Should convert true to 1');
      assert.ok(result[0].includes('0'), 'Should convert false to 0');
    });

    it('should handle NULL boolean values', () => {
      const rows = [
        { id: 1, is_active: null }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['is_active', { type: 'boolean' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('NULL'), 'Should preserve NULL values');
    });
  });

  describe('Timestamp Conversion', () => {
    it('should convert Unix epoch to ISO 8601 string', () => {
      const timestamp = new Date('2024-01-15T10:30:00.000Z').getTime();
      const rows = [
        { id: 1, created_at: timestamp }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['created_at', { type: 'timestamp' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('2024-01-15'), 'Should convert to ISO date');
      assert.ok(result[0].includes('::timestamp'), 'Should include PostgreSQL cast');
    });

    it('should handle ISO 8601 string timestamps', () => {
      const rows = [
        { id: 1, created_at: '2024-01-15 10:30:00' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['created_at', { type: 'datetime' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('2024-01-15 10:30:00'), 'Should preserve ISO string');
      assert.ok(result[0].includes('::timestamp'), 'Should include PostgreSQL cast');
    });

    it('should handle Date objects in timestamp columns', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const rows = [
        { id: 1, created_at: date.getTime() }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['created_at', { type: 'timestamp' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('2024-01-15'), 'Should format as ISO date');
    });

    it('should convert ISO 8601 format strings to MySQL DATETIME format', () => {
      const rows = [
        { id: 1, migration_time: '2025-11-05T00:07:53.343Z' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['migration_time', { type: 'datetime' }]
      ]);

      const result = generateBulkInsert('knex_migrations', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('2025-11-05 00:07:53'), 'Should convert ISO 8601 to MySQL DATETIME');
      assert.ok(!result[0].includes('T'), 'Should not contain T separator');
      assert.ok(!result[0].includes('Z'), 'Should not contain Z timezone indicator');
    });

    it('should handle ISO 8601 format with timezone offset for MySQL', () => {
      const rows = [
        { id: 1, created_at: '2024-06-15T14:30:00+09:00' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['created_at', { type: 'timestamp' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      // Should convert to UTC: 14:30:00+09:00 -> 05:30:00 UTC
      assert.ok(result[0].includes('2024-06-15'), 'Should preserve date part');
      assert.ok(!result[0].includes('T'), 'Should not contain T separator');
    });

    it('should convert ISO 8601 format strings to PostgreSQL timestamp', () => {
      const rows = [
        { id: 1, created_at: '2025-11-05T00:07:53.343Z' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['created_at', { type: 'timestamp' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('2025-11-05 00:07:53'), 'Should convert to standard format');
      assert.ok(result[0].includes('::timestamp'), 'Should include PostgreSQL cast');
      assert.ok(!result[0].includes('T'), 'Should not contain T separator');
      assert.ok(!result[0].includes('Z'), 'Should not contain Z timezone indicator');
    });
  });

  describe('Binary Conversion', () => {
    it('should convert Buffer to PostgreSQL bytea hex format', () => {
      const buffer = Buffer.from('test data', 'utf8');
      const rows = [
        { id: 1, data: buffer }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['data', { type: 'bytea' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('\\x'), 'Should use PostgreSQL hex format');
      assert.ok(result[0].includes('::bytea'), 'Should include bytea cast');
    });

    it('should convert Buffer to MySQL/SQLite X\'hex\' format', () => {
      const buffer = Buffer.from('test data', 'utf8');
      const rows = [
        { id: 1, data: buffer }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['data', { type: 'blob' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('X\''), 'Should use MySQL hex format');
    });
  });

  describe('JSON Conversion', () => {
    it('should convert Object to JSON string with PostgreSQL cast', () => {
      const jsonData = { name: 'test', count: 42 };
      const rows = [
        { id: 1, metadata: jsonData }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['metadata', { type: 'json' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('::jsonb'), 'Should include jsonb cast');
      assert.ok(result[0].includes('"name"'), 'Should serialize JSON');
    });

    it('should convert Array to JSON string', () => {
      const arrayData = [1, 2, 3, 4, 5];
      const rows = [
        { id: 1, numbers: arrayData }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['numbers', { type: 'json' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'mysql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('[1,2,3,4,5]'), 'Should serialize array');
    });

    it('should handle nested objects in JSON columns', () => {
      const nestedData = {
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark', notifications: true }
      };
      const rows = [
        { id: 1, config: nestedData }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['config', { type: 'json' }]
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('"user"'), 'Should serialize nested object');
      assert.ok(result[0].includes('::jsonb'), 'Should include PostgreSQL cast');
    });
  });

  describe('PostgreSQL Array Conversion', () => {
    it('should convert JavaScript array to PostgreSQL ARRAY syntax', () => {
      const arrayData = [1, 2, 3];
      const rows = [
        { id: 1, tags: arrayData }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['tags', { type: 'array' }]  // PostgreSQL array type
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('ARRAY['), 'Should use PostgreSQL ARRAY syntax');
      assert.ok(result[0].includes('1,2,3'), 'Should include array elements');
    });

    it('should handle string arrays in PostgreSQL', () => {
      const stringArray = ['a', 'b', 'c'];
      const rows = [
        { id: 1, values: stringArray }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['values', { type: 'text[]' }]  // PostgreSQL text array
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('ARRAY['), 'Should use PostgreSQL ARRAY syntax');
      assert.ok(result[0].includes("'a','b','c'"), 'Should quote string elements');
    });
  });

  describe('NULL Handling', () => {
    it('should preserve NULL values across all databases', () => {
      const rows = [
        {
          id: 1,
          name: null,
          active: null,
          created_at: null,
          metadata: null
        }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['name', { type: 'varchar' }],
        ['active', { type: 'boolean' }],
        ['created_at', { type: 'timestamp' }],
        ['metadata', { type: 'json' }]
      ]);

      const formats: DatabaseFormat[] = ['postgresql', 'mysql', 'sqlite'];

      for (const format of formats) {
        const result = generateBulkInsert('test_table', rows, format, {
          columnInfo
        });

        assert.strictEqual(result.length, 1);
        // Count NULL occurrences (should be 4: name, active, created_at, metadata)
        const nullCount = (result[0].match(/NULL/g) || []).length;
        assert.ok(nullCount >= 4, `Should preserve NULL values in ${format}`);
      }
    });
  });

  describe('PostgreSQL Enum Conversion', () => {
    it('should convert enum values to quoted strings for PostgreSQL', () => {
      const rows = [
        { id: 1, status: 'active' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['status', { type: 'enum' }]  // PostgreSQL enum type
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("'active'"), 'Should quote enum value');
    });

    it('should handle user-defined enum types in PostgreSQL', () => {
      const rows = [
        { id: 1, priority: 'high' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }],
        ['priority', { type: 'user-defined' }]  // PostgreSQL user-defined type
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("'high'"), 'Should quote user-defined enum value');
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to formatValue when columnInfo is not provided', () => {
      const rows = [
        { id: 1, name: 'test' }
      ];

      // No columnInfo provided
      const result = generateBulkInsert('test_table', rows, 'postgresql', {});

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("'test'"), 'Should still format basic values');
    });

    it('should fallback when column not found in columnInfo', () => {
      const rows = [
        { id: 1, unknown_column: 'value' }
      ];

      const columnInfo = new Map([
        ['id', { type: 'integer' }]
        // unknown_column not in columnInfo
      ]);

      const result = generateBulkInsert('test_table', rows, 'postgresql', {
        columnInfo
      });

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("'value'"), 'Should fallback to formatValue');
    });
  });
});
