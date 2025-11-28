/**
 * Native RDBMS Integration Test Harness
 *
 * Provides parameterized testing utilities for running the same test suite
 * across MySQL, MariaDB, and PostgreSQL via fresh Knex migrations.
 *
 * Key Features:
 * - runTestsOnAllDatabases(): Run same tests on all 3 databases
 * - Database-agnostic assertion helpers
 * - Minimal test data seeding
 * - Automatic cleanup
 */

import { describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Knex } from 'knex';
import { initDatabase, teardownDatabase } from './db-init.js';
import { type DatabaseType } from '../../database/testing-config.js';
import { generateSqlDump, type DatabaseFormat } from '../../../utils/sql-dump/index.js';

// ============================================================================
// Parameterized Test Runner
// ============================================================================

/**
 * Run the same test suite on MySQL, MariaDB, and PostgreSQL
 *
 * This is the KEY function that enables DRY testing - write tests once,
 * run on all databases automatically.
 *
 * @param suiteName - Test suite name (e.g., "Decision Operations")
 * @param defineTests - Function that defines tests using getDb() closure
 *
 * @example
 * ```typescript
 * runTestsOnAllDatabases('Decision Operations', (getDb, dbType) => {
 *   it('should set decision', async () => {
 *     const db = getDb();
 *     const result = await setDecision(db, { ... });
 *     assert.ok(result.id);
 *   });
 * });
 * ```
 */
export function runTestsOnAllDatabases(
  suiteName: string,
  defineTests: (getDb: () => Knex, dbType: DatabaseType) => void
): void {
  const databases: DatabaseType[] = ['mysql', 'mariadb', 'postgresql'];

  for (const dbType of databases) {
    describe(`${suiteName} - ${dbType}`, () => {
      let db: Knex;

      before(async () => {
        console.log(`  🔧 Initializing ${dbType} database...`);
        db = await initDatabase(dbType);
        await seedTestData(db);
        console.log(`  ✅ ${dbType} ready`);
      });

      after(async () => {
        console.log(`  🧹 Cleaning up ${dbType}...`);
        await teardownDatabase(db);
        console.log(`  ✅ ${dbType} cleanup complete`);
      });

      // Run the same tests with this database connection
      defineTests(() => db, dbType);
    });
  }
}

// ============================================================================
// Test Data Seeding
// ============================================================================

/**
 * Seed minimal test data for operations testing
 *
 * Creates baseline master data required for decision/constraint/task operations:
 * - 9 layers (presentation, business, data, infrastructure, cross-cutting,
 *             documentation, planning, coordination, review)
 * - 5 tags (test, api, performance, security, architecture)
 * - 3 scopes (global, module, component)
 *
 * @param db - Knex database connection
 */
export async function seedTestData(db: Knex): Promise<void> {
  // Layers (should already exist from migrations, but verify)
  const layerCount = await db('v4_layers').count('* as count').first();
  if (!layerCount || layerCount.count === 0) {
    await db('v4_layers').insert([
      { name: 'presentation' },
      { name: 'business' },
      { name: 'data' },
      { name: 'infrastructure' },
      { name: 'cross-cutting' },
      { name: 'documentation' },
      { name: 'planning' },
      { name: 'coordination' },
      { name: 'review' },
    ]);
  }

  // Tags
  const tags = ['test', 'api', 'performance', 'security', 'architecture'];
  for (const tag of tags) {
    const exists = await db('v4_tags').where({ name: tag, project_id: 1 }).first();
    if (!exists) {
      await db('v4_tags').insert({ name: tag, project_id: 1 });
    }
  }

  // Scopes
  const scopes = ['global', 'module', 'component'];
  for (const scope of scopes) {
    const exists = await db('v4_scopes').where({ name: scope, project_id: 1 }).first();
    if (!exists) {
      await db('v4_scopes').insert({ name: scope, project_id: 1 });
    }
  }

  // Task statuses (should exist from migrations, but verify)
  const statusCount = await db('v4_task_statuses').count('* as count').first();
  if (!statusCount || statusCount.count === 0) {
    await db('v4_task_statuses').insert([
      { name: 'todo' },
      { name: 'in_progress' },
      { name: 'waiting_review' },
      { name: 'blocked' },
      { name: 'done' },
      { name: 'archived' },
    ]);
  }
}

/**
 * Clean up test data (keep schema intact)
 *
 * Deletes all transaction data while preserving master tables.
 * Schema remains for fast test execution (no migration re-run).
 *
 * @param db - Knex database connection
 */
export async function cleanupTestData(db: Knex): Promise<void> {
  // Delete in correct order (children first, parents last)
  // Transaction tables

  // t_decision_tags has (decision_key_id, project_id, tag_id)
  await db('v4_decision_tags').where('project_id', 1).del();
  // v4_decision_scopes has (decision_key_id, project_id, scope_id)
  await db('v4_decision_scopes').where('project_id', 1).del();
  // t_decision_context has project_id (added in v3.7.0)
  await db('v4_decision_context').where('project_id', 1).del();
  // v4_decisions has project_id
  await db('v4_decisions').where('project_id', 1).del();
  // t_decisions_numeric has project_id
  await db('v4_decisions_numeric').where('project_id', 1).del();
  // v4_context_keys has (id, key_name) - NO project_id
  await db('v4_context_keys').del();

  await db('v4_constraints').where('project_id', 1).del();

  await db('v4_task_dependencies').del();
  await db('v4_task_tags').where('project_id', 1).del();
  await db('v4_task_decision_links').del();
  await db('v4_task_constraint_links').del();
  await db('v4_task_file_links').del();
  await db('v4_tasks').where('project_id', 1).del();

  await db('v4_file_changes').where('project_id', 1).del();
  await db('v4_files').where('project_id', 1).del();

  // m_tag_index has (tag_name, decision_count, ..., total_count) - NO project_id
  await db('m_tag_index').del();
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a decision exists with expected key and value
 *
 * @param db - Knex database connection
 * @param key - Decision key to check
 * @param expectedValue - Expected decision value
 */
export async function assertDecisionExists(
  db: Knex,
  key: string,
  expectedValue: string
): Promise<void> {
  const contextKey = await db('v4_context_keys')
    .where({ key_name: key })
    .first();

  assert.ok(contextKey, `Decision key "${key}" should exist`);

  const decision = await db('v4_decisions')
    .where({ key_id: contextKey.id, project_id: 1 })
    .first();

  assert.ok(decision, `Decision for key "${key}" should exist`);
  assert.strictEqual(decision.value, expectedValue, `Decision value should match`);
}

/**
 * Assert that a constraint is active
 *
 * @param db - Knex database connection
 * @param rule - Constraint rule to check
 */
export async function assertConstraintActive(db: Knex, rule: string): Promise<void> {
  const constraint = await db('v4_constraints')
    .where({ constraint_text: rule, active: 1, project_id: 1 })
    .first();

  assert.ok(constraint, `Constraint "${rule}" should be active`);
}

/**
 * Assert that a task has the expected status
 *
 * @param db - Knex database connection
 * @param taskId - Task ID to check
 * @param expectedStatus - Expected task status
 */
export async function assertTaskStatus(
  db: Knex,
  taskId: number,
  expectedStatus: string
): Promise<void> {
  const task = await db('v4_tasks')
    .where({ id: taskId })
    .first();

  assert.ok(task, `Task ${taskId} should exist`);
  assert.strictEqual(task.status, expectedStatus, `Task ${taskId} status should be ${expectedStatus}`);
}

/**
 * Assert that a decision has specific tags
 *
 * @param db - Knex database connection
 * @param key - Decision key
 * @param expectedTags - Array of expected tag names
 */
export async function assertDecisionHasTags(
  db: Knex,
  key: string,
  expectedTags: string[]
): Promise<void> {
  const contextKey = await db('v4_context_keys')
    .where({ key_name: key })
    .first();

  assert.ok(contextKey, `Decision key "${key}" should exist`);

  const tags = await db('v4_decision_tags')
    .join('v4_tags', 'v4_decision_tags.tag_id', 'v4_tags.id')
    .where({ 'v4_decision_tags.decision_key_id': contextKey.id, 'v4_decision_tags.project_id': 1 })
    .pluck('v4_tags.name');

  assert.strictEqual(tags.length, expectedTags.length, `Should have ${expectedTags.length} tags`);

  for (const expectedTag of expectedTags) {
    assert.ok(tags.includes(expectedTag), `Should have tag "${expectedTag}"`);
  }
}

/**
 * Assert that tag index is populated for a decision
 *
 * @param db - Knex database connection
 * @param key - Decision key
 * @param expectedTags - Array of expected tag names in index
 */
export async function assertTagIndexPopulated(
  db: Knex,
  key: string,
  expectedTags: string[]
): Promise<void> {
  const contextKey = await db('v4_context_keys')
    .where({ key_name: key })
    .first();

  assert.ok(contextKey, `Decision key "${key}" should exist`);

  const indexEntries = await db('m_tag_index')
    .where({ decision_key_id: contextKey.id, project_id: 1 })
    .pluck('tag_name');

  assert.strictEqual(indexEntries.length, expectedTags.length, `Tag index should have ${expectedTags.length} entries`);

  for (const expectedTag of expectedTags) {
    assert.ok(indexEntries.includes(expectedTag), `Tag index should contain "${expectedTag}"`);
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get tag ID by name (creates if not exists)
 *
 * @param db - Knex database connection
 * @param tagName - Tag name
 * @returns Tag ID
 */
export async function getTagId(db: Knex, tagName: string): Promise<number> {
  let tag = await db('v4_tags').where({ name: tagName, project_id: 1 }).first();

  if (!tag) {
    await db('v4_tags').insert({ name: tagName, project_id: 1 });
    tag = await db('v4_tags').where({ name: tagName, project_id: 1 }).first();
  }

  return tag.id;
}

/**
 * Get layer ID by name
 *
 * @param db - Knex database connection
 * @param layerName - Layer name
 * @returns Layer ID
 */
export async function getLayerId(db: Knex, layerName: string): Promise<number> {
  const layer = await db('v4_layers').where({ name: layerName }).first();
  assert.ok(layer, `Layer "${layerName}" should exist`);
  return layer.id;
}

/**
 * Get scope ID by name (creates if not exists)
 *
 * @param db - Knex database connection
 * @param scopeName - Scope name
 * @returns Scope ID
 */
export async function getScopeId(db: Knex, scopeName: string): Promise<number> {
  let scope = await db('v4_scopes').where({ name: scopeName, project_id: 1 }).first();

  if (!scope) {
    await db('v4_scopes').insert({ name: scopeName, project_id: 1 });
    scope = await db('v4_scopes').where({ name: scopeName, project_id: 1 }).first();
  }

  return scope.id;
}

// ============================================================================
// Cross-Database Migration Test Helpers
// ============================================================================

/**
 * Source databases for cross-database migration testing
 * Includes SQLite (local) + Docker databases (MySQL, MariaDB, PostgreSQL)
 */
export type CrossDbSourceType = 'sqlite' | DatabaseType;

/**
 * Target database formats for SQL dump output
 */
export type CrossDbTargetFormat = DatabaseFormat;

/**
 * Seed rich test data covering all v4 tables for migration testing
 *
 * Creates comprehensive test data including:
 * - Master tables: layers, tags, scopes, task_statuses
 * - Decisions with tags and scopes
 * - Tasks with dependencies
 * - Constraints
 * - File changes
 *
 * @param db - Knex database connection
 * @param projectId - Project ID to use (default: 1)
 */
export async function seedRichTestData(db: Knex, projectId: number = 1): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Create context keys and decisions
  const decisionKeys = ['migration-test-decision-1', 'migration-test-decision-2', 'migration-test-decision-3'];
  for (let i = 0; i < decisionKeys.length; i++) {
    const keyName = decisionKeys[i];
    await db('v4_context_keys').insert({ key_name: keyName });
    const keyRecord = await db('v4_context_keys').where({ key_name: keyName }).first();

    const layerId = (i % 3) + 1; // Rotate through layers 1, 2, 3
    await db('v4_decisions').insert({
      key_id: keyRecord.id,
      project_id: projectId,
      value: `Test decision value ${i + 1}`,
      version: '1.0.0',
      ts: now - (i * 100),
      layer_id: layerId,
      status: 1, // Status.ACTIVE = 1
    });

    // Add tags to decisions
    const tagIds = await db('v4_tags').where({ project_id: projectId }).limit(2).pluck('id');
    for (const tagId of tagIds) {
      await db('v4_decision_tags').insert({
        decision_key_id: keyRecord.id,
        project_id: projectId,
        tag_id: tagId,
      }).catch(() => {}); // Ignore duplicates
    }
  }

  // 2. Create constraints
  const constraints = [
    { text: 'Migration test constraint 1', category: 'architecture', priority: 3 },
    { text: 'Migration test constraint 2', category: 'performance', priority: 2 },
  ];
  for (const c of constraints) {
    const categoryRecord = await db('v4_constraint_categories').where({ name: c.category }).first();
    await db('v4_constraints').insert({
      constraint_text: c.text,
      project_id: projectId,
      category_id: categoryRecord?.id || 1,
      priority: c.priority,
      layer_id: 1,
      active: 1,
      ts: now,
    });
  }

  // 3. Create tasks with dependencies
  const statusTodo = await db('v4_task_statuses').where({ name: 'todo' }).first();
  const taskIds: number[] = [];

  for (let i = 0; i < 3; i++) {
    const taskTitle = `Migration test task ${i + 1}`;
    // Note: v4 schema has description in v4_task_details, not v4_tasks
    await db('v4_tasks').insert({
      title: taskTitle,
      project_id: projectId,
      status_id: statusTodo.id,
      priority: 2,
      layer_id: 1,
      created_ts: now,
      updated_ts: now,
    });

    // Query to get the inserted ID (works across all DB types)
    const lastTask = await db('v4_tasks')
      .where({ title: taskTitle, project_id: projectId })
      .first();
    taskIds.push(lastTask.id);
  }

  // Create task dependency: task 2 depends on task 1
  if (taskIds.length >= 2) {
    await db('v4_task_dependencies').insert({
      blocker_task_id: taskIds[0],
      blocked_task_id: taskIds[1],
    }).catch(() => {}); // Ignore if exists
  }

  // 4. Create file change record
  const filePath = '/test/migration-test.ts';
  let existingFile = await db('v4_files').where({ path: filePath, project_id: projectId }).first();
  if (!existingFile) {
    await db('v4_files').insert({
      path: filePath,
      project_id: projectId,
    });
    existingFile = await db('v4_files').where({ path: filePath, project_id: projectId }).first();
  }
  const fileId = existingFile.id;

  await db('v4_file_changes').insert({
    file_id: fileId,
    project_id: projectId,
    change_type: 1, // ChangeType.CREATE = 1
    ts: now,
  });
}

/**
 * Execute SQL dump generation from a database
 *
 * @param db - Source Knex database connection
 * @param targetFormat - Target database format (mysql, postgresql, sqlite)
 * @returns Generated SQL dump string
 */
export async function executeSqlDump(
  db: Knex,
  targetFormat: CrossDbTargetFormat
): Promise<string> {
  return generateSqlDump(db, targetFormat, {
    includeHeader: true,
    includeSchema: true,
    chunkSize: 100,
    conflictMode: 'replace',
  });
}


/**
 * Verify sqlew access by checking row counts and basic CRUD operations
 *
 * @param db - Knex database connection to verify
 * @param expectedCounts - Expected row counts per table
 * @returns Verification result with details
 */
export async function verifySqlewAccess(
  db: Knex,
  expectedCounts?: Record<string, number>
): Promise<{
  success: boolean;
  tables: Record<string, { count: number; expected?: number; match: boolean }>;
  errors: string[];
}> {
  const errors: string[] = [];
  const tables: Record<string, { count: number; expected?: number; match: boolean }> = {};

  // Core v4 tables to verify
  const tablesToCheck = [
    'v4_projects',
    'v4_layers',
    'v4_tags',
    'v4_context_keys',
    'v4_decisions',
    'v4_decision_tags',
    'v4_constraints',
    'v4_tasks',
    'v4_task_dependencies',
    'v4_files',
    'v4_file_changes',
  ];

  for (const table of tablesToCheck) {
    try {
      const result = await db(table).count('* as count').first();
      const count = Number(result?.count || 0);
      const expected = expectedCounts?.[table];
      const match = expected === undefined || count === expected;

      tables[table] = { count, expected, match };

      if (!match) {
        errors.push(`${table}: expected ${expected}, got ${count}`);
      }
    } catch (err) {
      errors.push(`${table}: ${(err as Error).message}`);
      tables[table] = { count: -1, match: false };
    }
  }

  // Test basic CRUD: Try to insert and read a decision
  try {
    const testKey = `migration-verify-${Date.now()}`;
    await db('v4_context_keys').insert({ key_name: testKey });
    const inserted = await db('v4_context_keys').where({ key_name: testKey }).first();
    if (!inserted) {
      errors.push('CRUD test failed: Could not read inserted context key');
    }
    // Cleanup
    await db('v4_context_keys').where({ key_name: testKey }).del();
  } catch (err) {
    errors.push(`CRUD test failed: ${(err as Error).message}`);
  }

  return {
    success: errors.length === 0,
    tables,
    errors,
  };
}

/**
 * Get row counts for all v4 tables
 *
 * @param db - Knex database connection
 * @returns Record of table names to row counts
 */
export async function getTableCounts(db: Knex): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const tables = [
    'v4_projects',
    'v4_layers',
    'v4_tags',
    'v4_scopes',
    'v4_context_keys',
    'v4_decisions',
    'v4_decision_tags',
    'v4_decision_scopes',
    'v4_constraints',
    'v4_tasks',
    'v4_task_statuses',
    'v4_task_dependencies',
    'v4_task_tags',
    'v4_files',
    'v4_file_changes',
  ];

  for (const table of tables) {
    try {
      const result = await db(table).count('* as count').first();
      counts[table] = Number(result?.count || 0);
    } catch {
      counts[table] = -1; // Table doesn't exist or error
    }
  }

  return counts;
}

