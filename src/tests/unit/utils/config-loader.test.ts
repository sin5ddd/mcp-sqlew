/**
 * Configuration Loader Test
 * Tests database authentication configuration parsing and validation
 */

import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadConfigFile,
  validateDatabaseConfig,
  normalizeDatabaseConfig,
} from '../config/loader.js';
import type { DatabaseConfig } from '../config/types.js';

// Test directory
const TEST_DIR = join(process.cwd(), '.sqlew-test');
const TEST_CONFIG_PATH = join(TEST_DIR, 'config.toml');

// Setup test directory
function setupTestDir() {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
}

// Cleanup test directory
function cleanupTestDir() {
  if (existsSync(TEST_CONFIG_PATH)) {
    unlinkSync(TEST_CONFIG_PATH);
  }
}

// Test cases
function runTests() {
  console.log('Starting Configuration Loader Tests...\n');

  setupTestDir();

  try {
    // Test 1: SQLite configuration (backward compatibility)
    console.log('Test 1: SQLite configuration');
    const sqliteConfig: DatabaseConfig = { path: '.sqlew/test.db' };
    const sqliteValidation = validateDatabaseConfig(sqliteConfig);
    console.log('  Result:', sqliteValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!sqliteValidation.valid) {
      console.log('  Errors:', sqliteValidation.errors);
    }
    console.log('');

    // Test 2: PostgreSQL with direct auth
    console.log('Test 2: PostgreSQL with direct authentication');
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
    const pgDirectValidation = validateDatabaseConfig(pgDirectConfig);
    console.log('  Result:', pgDirectValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!pgDirectValidation.valid) {
      console.log('  Errors:', pgDirectValidation.errors);
    }
    console.log('');

    // Test 3: MySQL with SSL (SSH tests removed - manual tunneling only)
    console.log('Test 3: MySQL with SSL');
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
    const mysqlSSLValidation = validateDatabaseConfig(mysqlSSLConfig);
    console.log('  Result:', mysqlSSLValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!mysqlSSLValidation.valid) {
      console.log('  Errors:', mysqlSSLValidation.errors);
    }
    console.log('');

    // Test 4: Invalid database type
    console.log('Test 4: Invalid database type (should fail)');
    const invalidTypeConfig: DatabaseConfig = {
      type: 'mongodb' as any,
      connection: {
        host: 'localhost',
        port: 27017,
        database: 'test',
      },
    };
    const invalidTypeValidation = validateDatabaseConfig(invalidTypeConfig);
    console.log('  Result:', !invalidTypeValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!invalidTypeValidation.valid) {
      console.log('  Errors:', invalidTypeValidation.errors);
    }
    console.log('');

    // Test 5: Missing required fields
    console.log('Test 5: Missing required fields (should fail)');
    const missingFieldsConfig: DatabaseConfig = {
      type: 'postgres',
      connection: {
        host: 'localhost',
        port: 5432,
        database: 'test',
      },
      // auth is missing
    };
    const missingFieldsValidation = validateDatabaseConfig(missingFieldsConfig);
    console.log('  Result:', !missingFieldsValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!missingFieldsValidation.valid) {
      console.log('  Errors:', missingFieldsValidation.errors);
    }
    console.log('');

    // Test 6: SSL defaults normalization
    console.log('Test 6: Config normalization with SSL defaults');
    const unnormalizedConfig: DatabaseConfig = {
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
    const normalized = normalizeDatabaseConfig(unnormalizedConfig);
    const hasDefaults = normalized.auth?.ssl?.rejectUnauthorized === true;
    console.log('  Result:', hasDefaults ? '✓ PASS' : '✗ FAIL');
    console.log('  Normalized SSL config:', normalized.auth?.ssl);
    console.log('');

    // Test 7: Load from TOML file
    console.log('Test 7: Load configuration from TOML file');
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
    const loadedConfig = loadConfigFile(TEST_CONFIG_PATH);
    const loadSuccess =
      loadedConfig.database?.type === 'postgres' &&
      loadedConfig.database?.connection?.host === 'localhost' &&
      loadedConfig.database?.auth?.type === 'direct' &&
      loadedConfig.database?.auth?.user === 'postgres';
    console.log('  Result:', loadSuccess ? '✓ PASS' : '✗ FAIL');
    console.log('  Loaded database config:', loadedConfig.database);
    console.log('');

    // Test 8: Invalid port validation
    console.log('Test 8: Invalid port validation (should fail)');
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
    const invalidPortValidation = validateDatabaseConfig(invalidPortConfig);
    console.log('  Result:', !invalidPortValidation.valid ? '✓ PASS' : '✗ FAIL');
    if (!invalidPortValidation.valid) {
      console.log('  Errors:', invalidPortValidation.errors);
    }
    console.log('');

    console.log('All tests completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    cleanupTestDir();
  }
}

// Run tests
runTests();
