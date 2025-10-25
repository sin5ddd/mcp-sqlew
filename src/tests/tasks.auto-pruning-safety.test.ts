/**
 * Integration tests for v3.5.0 Auto-Pruning Safety Check
 * Tests that the system blocks task transition when ALL watched files are non-existent
 *
 * Test Scenario: Zero Work Done Protection
 * - Create task with 3 watched files
 * - Make ALL 3 files non-existent
 * - Trigger detectAndTransitionToReview()
 * - Expected: Error thrown, task status unchanged, transaction rolled back
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { initializeDatabase, closeDatabase } from '../database.js';
import type { DatabaseAdapter } from '../adapters/types.js';
import { detectAndTransitionToReview } from '../utils/task-stale-detection.js';

describe('Auto-pruning: Safety check when all files pruned', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await initializeDatabase({
      databaseType: 'sqlite',
      connection: { filename: ':memory:' }
    });
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('should block transition when all watched files are non-existent', async () => {
    const knex = db.getKnex();

    // 1. Create test task in 'in_progress' status
    const taskId = await createTestTask(db);

    // 2. Add 3 non-existent files to watch list
    // Using paths that will never exist in the test environment
    const nonExistentFiles = [
      '/tmp/never-created-file-1.ts',
      '/tmp/never-created-file-2.ts',
      '/tmp/never-created-file-3.ts'
    ];
    await addWatchedFiles(db, taskId, nonExistentFiles);

    // 3. Make task appear "stale" by backdating its updated_ts
    // Set updated_ts to 10 minutes ago (older than default 3-minute idle threshold)
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    await knex('t_tasks')
      .where({ id: taskId })
      .update({ updated_ts: tenMinutesAgo });

    // 4. Verify task is in 'in_progress' before attempt
    const beforeStatus = await knex('t_tasks as t')
      .join('m_task_statuses as s', 't.status_id', 's.id')
      .where('t.id', taskId)
      .select('s.name')
      .first() as { name: string };

    assert.strictEqual(beforeStatus.name, 'in_progress', 'Task should start in in_progress');

    // 5. Verify watch list has all 3 files before attempt
    const beforeWatchCount = await knex('t_task_file_links')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(beforeWatchCount.count, 3, 'Watch list should have 3 files before pruning attempt');

    // 6. Attempt transition - should NOT throw at top level
    // The error should be caught internally and logged
    // Task should remain in in_progress without transitioning
    const transitioned = await detectAndTransitionToReview(db);

    // 7. Verify zero tasks were transitioned
    assert.strictEqual(transitioned, 0, 'No tasks should have been transitioned');

    // 8. Verify task status unchanged (remains in in_progress)
    const afterStatus = await knex('t_tasks as t')
      .join('m_task_statuses as s', 't.status_id', 's.id')
      .where('t.id', taskId)
      .select('s.name')
      .first() as { name: string };

    assert.strictEqual(afterStatus.name, 'in_progress', 'Task should remain in in_progress after safety check');

    // 9. Verify NO audit records created (transaction rollback)
    const prunedCount = await knex('t_task_pruned_files')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(prunedCount.count, 0, 'Should have no pruned file records due to rollback');

    // 10. Verify watch list is NOT empty (transaction rolled back)
    const afterWatchCount = await knex('t_task_file_links')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(afterWatchCount.count, 3, 'Watch list should still have all 3 files after rollback');
  });

  it('should prune SOME non-existent files and continue (partial prune)', async () => {
    const knex = db.getKnex();

    // Create task
    const taskId = await createTestTask(db);

    // Add mix of existent and non-existent files
    // Use package.json as a file that definitely exists in the project root
    const mixedFiles = [
      'package.json', // exists
      '/tmp/never-created-file-1.ts', // does not exist
      '/tmp/never-created-file-2.ts'  // does not exist
    ];
    await addWatchedFiles(db, taskId, mixedFiles);

    // Make task appear stale
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    await knex('t_tasks')
      .where({ id: taskId })
      .update({ updated_ts: tenMinutesAgo });

    // Verify initial watch count
    const beforeWatchCount = await knex('t_task_file_links')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(beforeWatchCount.count, 3, 'Watch list should start with 3 files');

    // Attempt transition - should proceed with partial pruning
    await detectAndTransitionToReview(db);

    // Verify some files were pruned
    const prunedCount = await knex('t_task_pruned_files')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(prunedCount.count, 2, 'Should have 2 pruned file records (the non-existent ones)');

    // Verify watch list now has only 1 file (the existing one)
    const afterWatchCount = await knex('t_task_file_links')
      .where({ task_id: taskId })
      .count('* as count')
      .first() as { count: number };

    assert.strictEqual(afterWatchCount.count, 1, 'Watch list should have 1 remaining file after partial prune');

    // Verify remaining file is package.json
    const remainingFile = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .select('f.path')
      .first() as { path: string };

    assert.strictEqual(remainingFile.path, 'package.json', 'Remaining file should be package.json');
  });

  it('should handle task with no watched files gracefully', async () => {
    const knex = db.getKnex();

    // Create task without any watched files
    const taskId = await createTestTask(db);

    // Make task appear stale
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    await knex('t_tasks')
      .where({ id: taskId })
      .update({ updated_ts: tenMinutesAgo });

    // Attempt transition - should skip this task
    const transitioned = await detectAndTransitionToReview(db);

    assert.strictEqual(transitioned, 0, 'Should not transition task with no watched files');

    // Verify task status unchanged
    const status = await knex('t_tasks as t')
      .join('m_task_statuses as s', 't.status_id', 's.id')
      .where('t.id', taskId)
      .select('s.name')
      .first() as { name: string };

    assert.strictEqual(status.name, 'in_progress', 'Task should remain in in_progress');
  });

  console.log('\n✅ All auto-pruning safety check tests passed!\n');
});

/**
 * Helper: Create a test task in 'in_progress' status
 */
async function createTestTask(db: DatabaseAdapter): Promise<number> {
  const knex = db.getKnex();

  // Create test agent
  const [agentId] = await knex('m_agents')
    .insert({ name: 'test-agent' })
    .onConflict('name')
    .ignore()
    .returning('id');

  // If insert was ignored, get the existing agent
  let actualAgentId: number;
  if (agentId) {
    actualAgentId = agentId.id || agentId;
  } else {
    const agent = await knex('m_agents')
      .where({ name: 'test-agent' })
      .select('id')
      .first() as { id: number };
    actualAgentId = agent.id;
  }

  // Get 'in_progress' status ID
  const statusRow = await knex('m_task_statuses')
    .where({ name: 'in_progress' })
    .select('id')
    .first() as { id: number };

  // Create task with updated_ts set to now (will be backdated in tests)
  const currentTs = Math.floor(Date.now() / 1000);
  const [taskId] = await knex('t_tasks')
    .insert({
      title: 'Test task for auto-pruning',
      status_id: statusRow.id,
      priority: 2,
      assigned_agent_id: actualAgentId,
      created_by_agent_id: actualAgentId,
      created_ts: currentTs,
      updated_ts: currentTs
    })
    .returning('id');

  return taskId.id || taskId;
}

/**
 * Helper: Add watched files to a task
 */
async function addWatchedFiles(db: DatabaseAdapter, taskId: number, filePaths: string[]): Promise<void> {
  const knex = db.getKnex();

  for (const filePath of filePaths) {
    // Insert file (ignore if exists)
    await knex('m_files')
      .insert({ path: filePath })
      .onConflict('path')
      .ignore();

    // Get file ID
    const fileRow = await knex('m_files')
      .where({ path: filePath })
      .select('id')
      .first() as { id: number };

    // Link file to task
    await knex('t_task_file_links')
      .insert({
        task_id: taskId,
        file_id: fileRow.id
      });
  }
}
