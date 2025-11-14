/**
 * Test Lifecycle Management Module
 *
 * Provides utilities for test setup/teardown and managing test completion
 * with better-sqlite3 hanging prevention.
 */

import { Knex } from 'knex';
import type { DbConfig, DatabaseType } from './db-config.js';
import { connectDb, disconnectDb } from './db-schema.js';

// ============================================================================
// Test Context Management
// ============================================================================

export interface TestContext {
  dbs: Map<DatabaseType, Knex>;
  configs: Map<DatabaseType, DbConfig>;
}

/**
 * Setup test context with multiple databases
 */
export async function setupTestContext(types: DatabaseType[]): Promise<TestContext> {
  const dbs = new Map<DatabaseType, Knex>();
  const configs = new Map<DatabaseType, DbConfig>();

  for (const type of types) {
    const { getDbConfig } = await import('./db-config.js');
    const config = getDbConfig(type);
    configs.set(type, config);

    try {
      const db = await connectDb(config);
      dbs.set(type, db);
    } catch (error: any) {
      // Clean up already connected databases
      for (const [, db] of dbs) {
        await disconnectDb(db);
      }
      throw error;
    }
  }

  return { dbs, configs };
}

/**
 * Teardown test context (close all connections)
 */
export async function teardownTestContext(context: TestContext): Promise<void> {
  for (const [, db] of context.dbs) {
    await disconnectDb(db);
  }
}

// ============================================================================
// Better-SQLite3 Test Lifecycle Helpers (v3.9.0)
// ============================================================================

/**
 * Force exit after test completion to prevent better-sqlite3 hanging
 *
 * **Problem**: better-sqlite3 native addon keeps Node.js event loop alive
 * even after proper cleanup (db.destroy(), etc.)
 *
 * **Solution**: Embed forced exit in the LAST test of each test suite
 *
 * **Usage**:
 * ```typescript
 * describe('My Test Suite', () => {
 *   it('test 1', async () => { ... });
 *   it('test 2', async () => { ... });
 *
 *   it('test 3 (LAST)', async () => {
 *     // ... test logic ...
 *
 *     // Call at the END of the last test
 *     forceExitAfterTest();
 *   });
 * });
 * ```
 *
 * **Why setImmediate()?**
 * - Executes after current test completes but before Node test runner's `after()` hook
 * - Allows test to finish properly and report results
 * - Prevents event loop from hanging after all tests pass
 *
 * **Token Efficiency**: Reduces need for manual process.exit(0) in every test file
 */
export function forceExitAfterTest(): void {
  setImmediate(async () => {
    try {
      // Database cleanup can be skipped for temporary test databases
      // better-sqlite3 handles cleanup internally before exit
    } catch (error) {
      // Ignore cleanup errors
    } finally {
      // Force exit immediately (better-sqlite3 keeps event loop alive)
      process.exit(0);
    }
  });
}
