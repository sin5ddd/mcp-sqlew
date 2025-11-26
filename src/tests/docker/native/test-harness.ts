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
import type { DatabaseType } from '../../database/testing-config.js';

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
 * - 1 agent (system)
 * - 9 layers (presentation, business, data, infrastructure, cross-cutting,
 *             documentation, planning, coordination, review)
 * - 5 tags (test, api, performance, security, architecture)
 * - 3 scopes (global, module, component)
 *
 * @param db - Knex database connection
 */
export async function seedTestData(db: Knex): Promise<void> {
  // Agent
  const agentExists = await db('v4_agents').where({ name: 'system' }).first();
  if (!agentExists) {
    await db('v4_agents').insert({
      name: 'system',
      last_active_ts: Math.floor(Date.now() / 1000),
    });
  }

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
  // t_decision_scopes has (decision_key_id, project_id, scope_id)
  await db('t_decision_scopes').where('project_id', 1).del();
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
  await db('t_task_constraint_links').del();
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
    .join('v4_tags', 't_decision_tags.tag_id', 'v4_tags.id')
    .where({ 't_decision_tags.decision_key_id': contextKey.id, 't_decision_tags.project_id': 1 })
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
 * Get agent ID by name (creates if not exists)
 *
 * @param db - Knex database connection
 * @param name - Agent name
 * @returns Agent ID
 */
export async function getAgentId(db: Knex, name: string = 'system'): Promise<number> {
  let agent = await db('v4_agents').where({ name }).first();

  if (!agent) {
    await db('v4_agents').insert({
      name,
      last_active_ts: Math.floor(Date.now() / 1000),
    });
    agent = await db('v4_agents').where({ name }).first();
  }

  return agent.id;
}

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
