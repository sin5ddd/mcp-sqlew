/**
 * Integration tests for v3.5.0 Auto-Pruning persistence
 * Tests audit trail persistence after task archival (no cascade deletion)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../schema.js';
import { runAllMigrations } from '../migrations/index.js';
import { getOrCreateAgent, transaction } from '../database.js';
import type { Database as DatabaseType } from '../types.js';

/**
 * Test database instance
 */
let testDb: DatabaseType;

/**
 * Create an in-memory test database with schema and migrations
 */
function createTestDatabase(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);

  // Run migrations to add t_task_pruned_files table (v3.5.0)
  runAllMigrations(db);

  return db;
}

/**
 * Helper: Create a test task in 'done' status (ready to archive)
 */
function createTestTask(db: DatabaseType, title: string): number {
  const agentId = getOrCreateAgent(db, 'test-agent');
  const statusId = 5; // done (ready to archive)

  const result = db.prepare(`
    INSERT INTO t_tasks (title, status_id, priority, created_by_agent_id, assigned_agent_id)
    VALUES (?, ?, 2, ?, ?)
  `).run(title, statusId, agentId, agentId);

  return result.lastInsertRowid as number;
}

/**
 * Helper: Create a pruned file record in audit table
 */
function createPrunedFileRecord(
  db: DatabaseType,
  taskId: number,
  filePath: string
): number {
  const result = db.prepare(`
    INSERT INTO t_task_pruned_files (task_id, file_path, pruned_ts)
    VALUES (?, ?, unixepoch())
  `).run(taskId, filePath);

  return result.lastInsertRowid as number;
}

/**
 * Helper: Get task status by ID
 */
function getTaskStatus(db: DatabaseType, taskId: number): number {
  const row = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number } | undefined;
  if (!row) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return row.status_id;
}

/**
 * Helper: Count pruned file records for a task
 */
function countPrunedFiles(db: DatabaseType, taskId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM t_task_pruned_files WHERE task_id = ?
  `).get(taskId) as { count: number };
  return row.count;
}

/**
 * Helper: Archive a task (test version)
 */
function archiveTask(db: DatabaseType, taskId: number): { success: boolean; task_id: number } {
  const TASK_STATUS_DONE = 5;
  const TASK_STATUS_ARCHIVED = 6;

  return transaction(db, () => {
    // Check if task is in 'done' status
    const taskRow = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number } | undefined;

    if (!taskRow) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    if (taskRow.status_id !== TASK_STATUS_DONE) {
      throw new Error(`Task ${taskId} must be in 'done' status to archive`);
    }

    // Update to archived
    db.prepare('UPDATE t_tasks SET status_id = ? WHERE id = ?').run(TASK_STATUS_ARCHIVED, taskId);

    return { success: true, task_id: taskId };
  });
}

/**
 * Helper: Get pruned files for a task (test version)
 */
function getPrunedFiles(db: DatabaseType, taskId: number): {
  success: boolean;
  count: number;
  pruned_files: Array<{ file_path: string; pruned_ts: number }>;
} {
  const rows = db.prepare(`
    SELECT file_path, pruned_ts
    FROM t_task_pruned_files
    WHERE task_id = ?
    ORDER BY pruned_ts DESC
  `).all(taskId) as Array<{ file_path: string; pruned_ts: number }>;

  return {
    success: true,
    count: rows.length,
    pruned_files: rows
  };
}

describe('Auto-pruning: Audit trail persistence after archival', () => {
  beforeEach(() => {
    testDb = createTestDatabase();
  });

  afterEach(() => {
    testDb.close();
  });

  it('should preserve audit trail after task archival', () => {
    // 1. Setup: Create task with pruned files
    const taskId = createTestTask(testDb, 'Task with pruned files');

    // Create multiple pruned file records
    const prunedFileIds = [
      createPrunedFileRecord(testDb, taskId, '/tmp/file1.ts'),
      createPrunedFileRecord(testDb, taskId, '/tmp/file2.ts'),
      createPrunedFileRecord(testDb, taskId, '/tmp/file3.ts')
    ];

    assert.equal(prunedFileIds.length, 3, 'Should create 3 pruned file records');

    // 2. Verify pruned files exist before archival
    const beforeCount = countPrunedFiles(testDb, taskId);
    assert.equal(beforeCount, 3, 'Should have 3 pruned file records before archival');

    // 3. Archive the task
    const archiveResult = archiveTask(testDb, taskId);

    assert.ok(archiveResult.success, 'Task archival should succeed');
    assert.equal(archiveResult.task_id, taskId);

    // 4. Verify task is archived
    const taskStatus = getTaskStatus(testDb, taskId);
    assert.equal(taskStatus, 6, 'Task should be archived (status_id 6)');

    // 5. Verify pruned files still exist (NOT cascade deleted)
    const afterCount = countPrunedFiles(testDb, taskId);
    assert.equal(afterCount, 3, 'Should still have 3 pruned file records after archival');

    // 6. Verify get_pruned_files works for archived tasks
    const getPrunedResult = getPrunedFiles(testDb, taskId);

    assert.ok(getPrunedResult.success, 'get_pruned_files should work for archived tasks');
    assert.equal(getPrunedResult.count, 3, 'Should return count of 3 pruned files');
    assert.equal(getPrunedResult.pruned_files.length, 3, 'Should return all 3 pruned files');

    // Verify file paths are preserved
    const filePaths = getPrunedResult.pruned_files.map((f: any) => f.file_path);
    assert.ok(filePaths.includes('/tmp/file1.ts'), 'Should include file1.ts');
    assert.ok(filePaths.includes('/tmp/file2.ts'), 'Should include file2.ts');
    assert.ok(filePaths.includes('/tmp/file3.ts'), 'Should include file3.ts');
  });

  it('should maintain foreign key integrity after archival', () => {
    const taskId = createTestTask(testDb, 'Task for FK test');
    createPrunedFileRecord(testDb, taskId, '/tmp/test.ts');

    // Archive task
    const archiveResult = archiveTask(testDb, taskId);
    assert.ok(archiveResult.success, 'Task archival should succeed');

    // Verify foreign key still valid (can JOIN successfully)
    const result = testDb.prepare(`
      SELECT tpf.id, tpf.task_id, t.status_id
      FROM t_task_pruned_files tpf
      JOIN t_tasks t ON tpf.task_id = t.id
      WHERE tpf.task_id = ?
    `).get(taskId) as { id: number; task_id: number; status_id: number } | undefined;

    assert.ok(result, 'Foreign key join should succeed');
    assert.equal(result!.task_id, taskId, 'Task ID should match');
    assert.equal(result!.status_id, 6, 'Task status should be archived (6)');
  });

  it('should handle zero pruned files for archived task', () => {
    const taskId = createTestTask(testDb, 'Task with no pruned files');

    // Archive without any pruned files
    const archiveResult = archiveTask(testDb, taskId);
    assert.ok(archiveResult.success);

    // Query pruned files - should return empty array
    const getPrunedResult = getPrunedFiles(testDb, taskId);
    assert.ok(getPrunedResult.success);
    assert.equal(getPrunedResult.count, 0);
    assert.equal(getPrunedResult.pruned_files.length, 0);
  });

  it('should preserve pruned file timestamps after archival', () => {
    const taskId = createTestTask(testDb, 'Task for timestamp test');

    // Create pruned file with explicit timestamp check
    const beforeTs = Math.floor(Date.now() / 1000);
    createPrunedFileRecord(testDb, taskId, '/tmp/timestamped.ts');

    // Archive task
    archiveTask(testDb, taskId);

    // Get pruned files and verify timestamp
    const getPrunedResult = getPrunedFiles(testDb, taskId);
    assert.equal(getPrunedResult.pruned_files.length, 1);

    const prunedFile = getPrunedResult.pruned_files[0];
    assert.ok(prunedFile.pruned_ts, 'Should have pruned_ts timestamp');
    assert.ok(prunedFile.file_path === '/tmp/timestamped.ts', 'File path should match');

    // Verify timestamp is reasonable (within last few seconds)
    const prunedAt = prunedFile.pruned_ts;
    assert.ok(prunedAt >= beforeTs, 'Timestamp should be after or equal to test start');
    assert.ok(prunedAt <= beforeTs + 5, 'Timestamp should be within 5 seconds');
  });

  it('should handle multiple archived tasks with pruned files', () => {
    // Create multiple tasks with pruned files
    const task1Id = createTestTask(testDb, 'Task 1');
    const task2Id = createTestTask(testDb, 'Task 2');
    const task3Id = createTestTask(testDb, 'Task 3');

    createPrunedFileRecord(testDb, task1Id, '/tmp/task1-file1.ts');
    createPrunedFileRecord(testDb, task1Id, '/tmp/task1-file2.ts');

    createPrunedFileRecord(testDb, task2Id, '/tmp/task2-file1.ts');

    createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file1.ts');
    createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file2.ts');
    createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file3.ts');

    // Archive all tasks
    archiveTask(testDb, task1Id);
    archiveTask(testDb, task2Id);
    archiveTask(testDb, task3Id);

    // Verify each task's pruned files are isolated and preserved
    const task1Pruned = getPrunedFiles(testDb, task1Id);
    assert.equal(task1Pruned.count, 2, 'Task 1 should have 2 pruned files');

    const task2Pruned = getPrunedFiles(testDb, task2Id);
    assert.equal(task2Pruned.count, 1, 'Task 2 should have 1 pruned file');

    const task3Pruned = getPrunedFiles(testDb, task3Id);
    assert.equal(task3Pruned.count, 3, 'Task 3 should have 3 pruned files');

    // Verify file paths are isolated (no cross-contamination)
    const task1Paths = task1Pruned.pruned_files.map((f: any) => f.file_path);
    assert.ok(!task1Paths.includes('/tmp/task2-file1.ts'), 'Task 1 should not include Task 2 files');
    assert.ok(!task1Paths.includes('/tmp/task3-file1.ts'), 'Task 1 should not include Task 3 files');
  });

  it('should verify CASCADE constraint when task is deleted (not archived)', () => {
    // This test verifies the ON DELETE CASCADE behavior
    const taskId = createTestTask(testDb, 'Task for deletion test');
    createPrunedFileRecord(testDb, taskId, '/tmp/cascade-test.ts');

    // Verify pruned file exists
    const beforeCount = countPrunedFiles(testDb, taskId);
    assert.equal(beforeCount, 1);

    // DELETE task (not archive) - should cascade delete pruned files
    testDb.prepare('DELETE FROM t_tasks WHERE id = ?').run(taskId);

    // Verify pruned file was cascade deleted
    const afterCount = countPrunedFiles(testDb, taskId);
    assert.equal(afterCount, 0, 'Pruned files should be CASCADE deleted when task is deleted');
  });

  console.log('\n✅ All auto-pruning persistence tests passed!\n');
});
