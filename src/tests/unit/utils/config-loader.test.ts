/**
 * Configuration Loader Test
 * Tests database authentication configuration parsing and validation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadConfigFile,
  validateDatabaseConfig,
  normalizeDatabaseConfig,
} from '../../../config/loader.js';
import type { DatabaseConfig } from '../../../config/types.js';

// Test directory
const TEST_DIR = join(process.cwd(), '.sqlew-test');
const TEST_CONFIG_PATH = join(TEST_DIR, 'config.toml');

describe('Configuration Loader', () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  describe('validateDatabaseConfig', () => {
    it('should validate SQLite configuration (backward compatibility)', () => {
      const sqliteConfig: DatabaseConfig = { path: '.sqlew/test.db' };
      const validation = validateDatabaseConfig(sqliteConfig);
      assert.strictEqual(validation.valid, true, validation.errors?.join(', '));
    });

    it('should validate PostgreSQL with direct auth', () => {
      const pgDirectConfig: DatabaseConfig = {
        type: 'postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'sqlew',
        },
        auth: {
          type: 'direct',
          user: 'postgres',
          password: 'secret',
        },
      };
      const validation = validateDatabaseConfig(pgDirectConfig);
      assert.strictEqual(validation.valid, true, validation.errors?.join(', '));
    });

    it('should validate MySQL with SSL', () => {
      const mysqlSSLConfig: DatabaseConfig = {
        type: 'mysql',
        connection: {
          host: 'mysql.example.com',
          port: 3306,
          database: 'sqlew_db',
        },
        auth: {
          type: 'direct',
          user: 'mysql_user',
          password: 'mysql_pass',
          ssl: {
            ca: '/path/to/ca.pem',
            rejectUnauthorized: true,
          },
        },
      };
      const validation = validateDatabaseConfig(mysqlSSLConfig);
      assert.strictEqual(validation.valid, true, validation.errors?.join(', '));
    });

    it('should reject invalid database type', () => {
      const invalidTypeConfig: DatabaseConfig = {
        type: 'mongodb' as any,
        connection: {
          host: 'localhost',
          port: 27017,
          database: 'test',
        },
      };
      const validation = validateDatabaseConfig(invalidTypeConfig);
      assert.strictEqual(validation.valid, false, 'Expected validation to fail for invalid type');
    });

    it('should reject missing required auth field for non-SQLite', () => {
      const missingFieldsConfig: DatabaseConfig = {
        type: 'postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'test',
        },
        // auth is missing
      };
      const validation = validateDatabaseConfig(missingFieldsConfig);
      assert.strictEqual(validation.valid, false, 'Expected validation to fail for missing auth');
    });

    it('should reject invalid port', () => {
      const invalidPortConfig: DatabaseConfig = {
        type: 'postgres',
        connection: {
          host: 'localhost',
          port: 99999, // Invalid port
          database: 'test',
        },
        auth: {
          type: 'direct',
          user: 'postgres',
          password: 'pass',
        },
      };
      const validation = validateDatabaseConfig(invalidPortConfig);
      assert.strictEqual(validation.valid, false, 'Expected validation to fail for invalid port');
    });
  });

  describe('normalizeDatabaseConfig', () => {
    it('should default SSL rejectUnauthorized to true', () => {
      const config: DatabaseConfig = {
        type: 'postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          database: 'test',
        },
        auth: {
          type: 'direct',
          user: 'postgres',
          password: 'pass',
          ssl: {
            ca: '/path/to/ca.pem',
            // rejectUnauthorized should default to true
          },
        },
      };
      const normalized = normalizeDatabaseConfig(config);
      assert.strictEqual(normalized.auth?.ssl?.rejectUnauthorized, true);
    });
  });

  describe('loadConfigFile', () => {
    it('should load configuration from TOML file', () => {
      const tomlContent = `
[database]
type = "postgres"

[database.connection]
host = "localhost"
port = 5432
database = "sqlew_test"

[database.auth]
type = "direct"
user = "postgres"
password = "testpass"

[database.auth.ssl]
ca = "/path/to/ca.pem"
rejectUnauthorized = true
`;
      writeFileSync(TEST_CONFIG_PATH, tomlContent, 'utf-8');
      const loadedConfig = loadConfigFile(TEST_DIR, 'config.toml');

      assert.strictEqual(loadedConfig.database?.type, 'postgres');
      assert.strictEqual(loadedConfig.database?.connection?.host, 'localhost');
      assert.strictEqual(loadedConfig.database?.auth?.type, 'direct');
      assert.strictEqual(loadedConfig.database?.auth?.user, 'postgres');
    });
  });
});
