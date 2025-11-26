/**
 * Database Seeding Module
 *
 * Provides utilities for seeding test data with foreign key relationships
 * and verifying seeded data exists.
 */

import { Knex } from 'knex';
import assert from 'node:assert';

// ============================================================================
// Data Seeding Helpers
// ============================================================================

/**
 * Seed test data with FK relationships
 * Creates a simple schema: projects → agents → context_keys → decisions
 */
export async function seedTestData(db: Knex): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Clear existing test data (use test IDs 10, 20, 100, 101 to avoid conflicts with migration-created data)
  await db('v4_decisions').where('key_id', '>=', 100).andWhere('key_id', '<=', 101).del();
  await db('v4_context_keys').where('id', '>=', 100).andWhere('id', '<=', 101).del();
  await db('v4_projects').where('name', 'like', 'test-project-%').del();

  // Seed v4_projects (use IDs 10, 20 to avoid conflicts)
  await db('v4_projects').insert([
    { id: 10, name: 'test-project-1', display_name: 'Test Project 1', detection_source: 'test', created_ts: now, last_active_ts: now },
    { id: 20, name: 'test-project-2', display_name: 'Test Project 2', detection_source: 'test', created_ts: now, last_active_ts: now },
  ]);

  // Note: v4_agents removed in v4.0 (agent tracking eliminated)

  // Seed v4_context_keys (use IDs 100, 101 to avoid conflicts)
  await db('v4_context_keys').insert([
    { id: 100, key_name: 'test/key1' },
    { id: 101, key_name: 'test/key2' },
  ]);

  // Seed v4_decisions (has FK to v4_projects, v4_context_keys)
  // Note: agent_id removed in v4.0
  await db('v4_decisions').insert([
    { key_id: 100, project_id: 10, value: 'test-value-1', ts: now },
    { key_id: 101, project_id: 20, value: 'test-value-2', ts: now },
  ]);
}

/**
 * Verify seeded data exists
 * Note: Migrations may create a default project (ID 1), so we check for our test projects specifically
 */
export async function assertSeededDataExists(db: Knex): Promise<void> {
  // Check for our specific test projects (IDs 10, 20)
  const testProjects = await db('v4_projects').whereIn('id', [10, 20]);
  assert.strictEqual(testProjects.length, 2, 'Should have 2 test projects (IDs 10, 20)');

  // Check for our test decisions
  const testDecisions = await db('v4_decisions').whereIn('key_id', [100, 101]);
  assert.strictEqual(testDecisions.length, 2, 'Should have 2 test decisions (key_ids 100, 101)');
}
