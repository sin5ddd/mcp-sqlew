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
} from '../../../config/loader.js';
import type { DatabaseConfig } from '../../../config/types.js';

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
  setupTestDir();

  let passedCount = 0;
  let failedCount = 0;
  const failures: string[] = [];

  try {
    // Test 1: SQLite configuration (backward compatibility)
    const sqliteConfig: DatabaseConfig = { path: '.sqlew/test.db' };
    const sqliteValidation = validateDatabaseConfig(sqliteConfig);
    if (sqliteValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push(`Test 1 (SQLite config): ${sqliteValidation.errors?.join(', ')}`);
    }

    // Test 2: PostgreSQL with direct auth
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
    if (pgDirectValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push(`Test 2 (PostgreSQL direct auth): ${pgDirectValidation.errors?.join(', ')}`);
    }

    // Test 3: MySQL with SSL (SSH tests removed - manual tunneling only)
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
    if (mysqlSSLValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push(`Test 3 (MySQL SSL): ${mysqlSSLValidation.errors?.join(', ')}`);
    }

    // Test 4: Invalid database type (should fail)
    const invalidTypeConfig: DatabaseConfig = {
      type: 'mongodb' as any,
      connection: {
        host: 'localhost',
        port: 27017,
        database: 'test',
      },
    };
    const invalidTypeValidation = validateDatabaseConfig(invalidTypeConfig);
    if (!invalidTypeValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push('Test 4 (Invalid type): Expected validation to fail but it passed');
    }

    // Test 5: Missing required fields (should fail)
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
    if (!missingFieldsValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push('Test 5 (Missing fields): Expected validation to fail but it passed');
    }

    // Test 6: SSL defaults normalization
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
    if (hasDefaults) {
      passedCount++;
    } else {
      failedCount++;
      failures.push(`Test 6 (SSL normalization): rejectUnauthorized not defaulted correctly`);
    }

    // Test 7: Load from TOML file
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
    const loadSuccess =
      loadedConfig.database?.type === 'postgres' &&
      loadedConfig.database?.connection?.host === 'localhost' &&
      loadedConfig.database?.auth?.type === 'direct' &&
      loadedConfig.database?.auth?.user === 'postgres';
    if (loadSuccess) {
      passedCount++;
    } else {
      failedCount++;
      const actual = JSON.stringify(loadedConfig.database || {});
      failures.push(`Test 7 (Load TOML): Config not loaded correctly. Got: ${actual}`);
    }

    // Test 8: Invalid port validation (should fail)
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
    if (!invalidPortValidation.valid) {
      passedCount++;
    } else {
      failedCount++;
      failures.push('Test 8 (Invalid port): Expected validation to fail but it passed');
    }

    // Summary
    console.log(`\nConfig Loader Tests: ${passedCount} passed, ${failedCount} failed`);

    // Show failures if any
    if (failures.length > 0) {
      console.log('\nFailures:');
      failures.forEach(failure => console.log(`  ✗ ${failure}`));
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    cleanupTestDir();
  }
}

// Run tests
runTests();
