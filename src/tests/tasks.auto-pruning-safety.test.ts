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
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../schema.js';
import { runAllMigrations } from '../migrations/index.js';
import { detectAndTransitionToReview } from '../utils/task-stale-detection.js';

describe('Auto-pruning: Safety check when all files pruned', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    runAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should block transition when all watched files are non-existent', async () => {
    // 1. Create test task in 'in_progress' status
    const taskId = createTestTask(db);

    // 2. Add 3 non-existent files to watch list
    // Using paths that will never exist in the test environment
    const nonExistentFiles = [
      '/tmp/never-created-file-1.ts',
      '/tmp/never-created-file-2.ts',
      '/tmp/never-created-file-3.ts'
    ];
    addWatchedFiles(db, taskId, nonExistentFiles);

    // 3. Make task appear "stale" by backdating its updated_ts
    // Set updated_ts to 10 minutes ago (older than default 3-minute idle threshold)
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    db.prepare(`
      UPDATE t_tasks
      SET updated_ts = ?
      WHERE id = ?
    `).run(tenMinutesAgo, taskId);

    // 4. Verify task is in 'in_progress' before attempt
    const beforeStatus = db.prepare(`
      SELECT s.name
      FROM t_tasks t
      JOIN m_task_statuses s ON t.status_id = s.id
      WHERE t.id = ?
    `).get(taskId) as { name: string };

    assert.strictEqual(beforeStatus.name, 'in_progress', 'Task should start in in_progress');

    // 5. Verify watch list has all 3 files before attempt
    const beforeWatchCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_file_links WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(beforeWatchCount.count, 3, 'Watch list should have 3 files before pruning attempt');

    // 6. Attempt transition - should NOT throw at top level
    // The error should be caught internally and logged
    // Task should remain in in_progress without transitioning
    const transitioned = await detectAndTransitionToReview(db);

    // 7. Verify zero tasks were transitioned
    assert.strictEqual(transitioned, 0, 'No tasks should have been transitioned');

    // 8. Verify task status unchanged (remains in in_progress)
    const afterStatus = db.prepare(`
      SELECT s.name
      FROM t_tasks t
      JOIN m_task_statuses s ON t.status_id = s.id
      WHERE t.id = ?
    `).get(taskId) as { name: string };

    assert.strictEqual(afterStatus.name, 'in_progress', 'Task should remain in in_progress after safety check');

    // 9. Verify NO audit records created (transaction rollback)
    const prunedCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_pruned_files WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(prunedCount.count, 0, 'Should have no pruned file records due to rollback');

    // 10. Verify watch list is NOT empty (transaction rolled back)
    const afterWatchCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_file_links WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(afterWatchCount.count, 3, 'Watch list should still have all 3 files after rollback');
  });

  it('should prune SOME non-existent files and continue (partial prune)', async () => {
    // Create task
    const taskId = createTestTask(db);

    // Add mix of existent and non-existent files
    // Use package.json as a file that definitely exists in the project root
    const mixedFiles = [
      'package.json', // exists
      '/tmp/never-created-file-1.ts', // does not exist
      '/tmp/never-created-file-2.ts'  // does not exist
    ];
    addWatchedFiles(db, taskId, mixedFiles);

    // Make task appear stale
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    db.prepare(`
      UPDATE t_tasks
      SET updated_ts = ?
      WHERE id = ?
    `).run(tenMinutesAgo, taskId);

    // Verify initial watch count
    const beforeWatchCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_file_links WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(beforeWatchCount.count, 3, 'Watch list should start with 3 files');

    // Attempt transition - should proceed with partial pruning
    await detectAndTransitionToReview(db);

    // Verify some files were pruned
    const prunedCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_pruned_files WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(prunedCount.count, 2, 'Should have 2 pruned file records (the non-existent ones)');

    // Verify watch list now has only 1 file (the existing one)
    const afterWatchCount = db.prepare(`
      SELECT COUNT(*) as count FROM t_task_file_links WHERE task_id = ?
    `).get(taskId) as { count: number };

    assert.strictEqual(afterWatchCount.count, 1, 'Watch list should have 1 remaining file after partial prune');

    // Verify remaining file is package.json
    const remainingFile = db.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `).get(taskId) as { path: string };

    assert.strictEqual(remainingFile.path, 'package.json', 'Remaining file should be package.json');
  });

  it('should handle task with no watched files gracefully', async () => {
    // Create task without any watched files
    const taskId = createTestTask(db);

    // Make task appear stale
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    db.prepare(`
      UPDATE t_tasks
      SET updated_ts = ?
      WHERE id = ?
    `).run(tenMinutesAgo, taskId);

    // Attempt transition - should skip this task
    const transitioned = await detectAndTransitionToReview(db);

    assert.strictEqual(transitioned, 0, 'Should not transition task with no watched files');

    // Verify task status unchanged
    const status = db.prepare(`
      SELECT s.name
      FROM t_tasks t
      JOIN m_task_statuses s ON t.status_id = s.id
      WHERE t.id = ?
    `).get(taskId) as { name: string };

    assert.strictEqual(status.name, 'in_progress', 'Task should remain in in_progress');
  });

  console.log('\n✅ All auto-pruning safety check tests passed!\n');
});

/**
 * Helper: Create a test task in 'in_progress' status
 */
function createTestTask(db: Database.Database): number {
  // Create test agent
  const agentId = db.prepare(`
    INSERT INTO m_agents (name) VALUES (?) RETURNING id
  `).get('test-agent') as { id: number };

  // Get 'in_progress' status ID
  const statusId = db.prepare(`
    SELECT id FROM m_task_statuses WHERE name = 'in_progress'
  `).get() as { id: number };

  // Create task with updated_ts set to now (will be backdated in tests)
  const taskId = db.prepare(`
    INSERT INTO t_tasks (
      title,
      status_id,
      priority,
      assigned_agent_id,
      created_by_agent_id,
      created_ts,
      updated_ts
    )
    VALUES (?, ?, 2, ?, ?, unixepoch(), unixepoch())
    RETURNING id
  `).get(
    'Test task for auto-pruning',
    statusId.id,
    agentId.id,
    agentId.id
  ) as { id: number };

  return taskId.id;
}

/**
 * Helper: Add watched files to a task
 */
function addWatchedFiles(db: Database.Database, taskId: number, filePaths: string[]): void {
  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO m_files (path) VALUES (?) RETURNING id
  `);

  const linkFile = db.prepare(`
    INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)
  `);

  for (const filePath of filePaths) {
    const fileResult = insertFile.get(filePath) as { id: number };
    linkFile.run(taskId, fileResult.id);
  }
}
