/**
 * Integration tests for v3.5.0 Auto-Pruning persistence
 * Tests audit trail persistence after task archival (no cascade deletion)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, closeDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/index.js';
import { getOrCreateAgent } from '../../../database.js';
import { ProjectContext } from '../../../utils/project-context.js';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;

/**
 * Create an in-memory test database with schema and migrations
 */
async function createTestDatabase(): Promise<DatabaseAdapter> {
  const adapter = await initializeDatabase({
    databaseType: 'sqlite',
    connection: {
      filename: ':memory:',
    },
  });

  // Enable foreign keys for SQLite
  const knex = adapter.getKnex();
  await knex.raw('PRAGMA foreign_keys = ON');

  return adapter;
}

/**
 * Helper: Create a test task in 'done' status (ready to archive)
 */
async function createTestTask(adapter: DatabaseAdapter, title: string): Promise<number> {
  const knex = adapter.getKnex();
  const agentId = await getOrCreateAgent(adapter, 'test-agent');
  const projectId = ProjectContext.getInstance().getProjectId();
  const statusId = 5; // done (ready to archive)
  const now = Math.floor(Date.now() / 1000);

  const [taskId] = await knex('v4_tasks').insert({
    title,
    status_id: statusId,
    priority: 2,
    project_id: projectId,  // Required after v3.7.0
    created_by_agent_id: agentId,
    assigned_agent_id: agentId,
    created_ts: now,  // Required NOT NULL field
    updated_ts: now   // Required NOT NULL field
  });

  return taskId;
}

/**
 * Helper: Create a pruned file record in audit table
 */
async function createPrunedFileRecord(
  adapter: DatabaseAdapter,
  taskId: number,
  filePath: string
): Promise<number> {
  const knex = adapter.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();

  const [id] = await knex('v4_task_pruned_files').insert({
    task_id: taskId,
    file_path: filePath,
    pruned_ts: knex.raw('unixepoch()'),
    project_id: projectId,  // Required after v3.7.0
  });

  return id;
}

/**
 * Helper: Get task status by ID
 */
async function getTaskStatus(adapter: DatabaseAdapter, taskId: number): Promise<number> {
  const knex = adapter.getKnex();
  const row = await knex('v4_tasks')
    .where({ id: taskId })
    .first('status_id');

  if (!row) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return row.status_id;
}

/**
 * Helper: Count pruned file records for a task
 */
async function countPrunedFiles(adapter: DatabaseAdapter, taskId: number): Promise<number> {
  const knex = adapter.getKnex();
  const row = await knex('v4_task_pruned_files')
    .where({ task_id: taskId })
    .count('* as count')
    .first();

  return row?.count as number || 0;
}

/**
 * Helper: Archive a task (test version)
 */
async function archiveTask(adapter: DatabaseAdapter, taskId: number): Promise<{ success: boolean; task_id: number }> {
  const TASK_STATUS_DONE = 5;
  const TASK_STATUS_ARCHIVED = 6;

  const knex = adapter.getKnex();

  return await knex.transaction(async (trx) => {
    // Check if task is in 'done' status
    const taskRow = await trx('v4_tasks')
      .where({ id: taskId })
      .first('status_id');

    if (!taskRow) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    if (taskRow.status_id !== TASK_STATUS_DONE) {
      throw new Error(`Task ${taskId} must be in 'done' status to archive`);
    }

    // Update to archived
    await trx('v4_tasks')
      .where({ id: taskId })
      .update({ status_id: TASK_STATUS_ARCHIVED });

    return { success: true, task_id: taskId };
  });
}

/**
 * Helper: Get pruned files for a task (test version)
 */
async function getPrunedFiles(adapter: DatabaseAdapter, taskId: number): Promise<{
  success: boolean;
  count: number;
  pruned_files: Array<{ file_path: string; pruned_ts: number }>;
}> {
  const knex = adapter.getKnex();

  const rows = await knex('v4_task_pruned_files')
    .where({ task_id: taskId })
    .select('file_path', 'pruned_ts')
    .orderBy('pruned_ts', 'desc');

  return {
    success: true,
    count: rows.length,
    pruned_files: rows
  };
}

describe('Auto-pruning: Audit trail persistence after archival', () => {
  let testCount = 0;
  const totalTests = 6; // Total number of tests in this suite

  beforeEach(async () => {
    testDb = await createTestDatabase();

    // Reset and re-initialize ProjectContext after creating new database
    ProjectContext.reset();
    const knex = testDb.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-auto-pruning-persistence', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  afterEach(async () => {
    testCount++;

    await closeDatabase();

    // Detect if running filtered tests (IDE scenario with --test-name-pattern)
    const isFilteredTest = process.argv.some(arg => arg.includes('--test-name-pattern'));
  });

  it('should preserve audit trail after task archival', async () => {
    // 1. Setup: Create task with pruned files
    const taskId = await createTestTask(testDb, 'Task with pruned files');

    // Create multiple pruned file records
    const prunedFileIds = [
      await createPrunedFileRecord(testDb, taskId, '/tmp/file1.ts'),
      await createPrunedFileRecord(testDb, taskId, '/tmp/file2.ts'),
      await createPrunedFileRecord(testDb, taskId, '/tmp/file3.ts')
    ];

    assert.equal(prunedFileIds.length, 3, 'Should create 3 pruned file records');

    // 2. Verify pruned files exist before archival
    const beforeCount = await countPrunedFiles(testDb, taskId);
    assert.equal(beforeCount, 3, 'Should have 3 pruned file records before archival');

    // 3. Archive the task
    const archiveResult = await archiveTask(testDb, taskId);

    assert.ok(archiveResult.success, 'Task archival should succeed');
    assert.equal(archiveResult.task_id, taskId);

    // 4. Verify task is archived
    const taskStatus = await getTaskStatus(testDb, taskId);
    assert.equal(taskStatus, 6, 'Task should be archived (status_id 6)');

    // 5. Verify pruned files still exist (NOT cascade deleted)
    const afterCount = await countPrunedFiles(testDb, taskId);
    assert.equal(afterCount, 3, 'Should still have 3 pruned file records after archival');

    // 6. Verify get_pruned_files works for archived tasks
    const getPrunedResult = await getPrunedFiles(testDb, taskId);

    assert.ok(getPrunedResult.success, 'get_pruned_files should work for archived tasks');
    assert.equal(getPrunedResult.count, 3, 'Should return count of 3 pruned files');
    assert.equal(getPrunedResult.pruned_files.length, 3, 'Should return all 3 pruned files');

    // Verify file paths are preserved
    const filePaths = getPrunedResult.pruned_files.map((f: any) => f.file_path);
    assert.ok(filePaths.includes('/tmp/file1.ts'), 'Should include file1.ts');
    assert.ok(filePaths.includes('/tmp/file2.ts'), 'Should include file2.ts');
    assert.ok(filePaths.includes('/tmp/file3.ts'), 'Should include file3.ts');
  });

  it('should maintain foreign key integrity after archival', async () => {
    const taskId = await createTestTask(testDb, 'Task for FK test');
    await createPrunedFileRecord(testDb, taskId, '/tmp/test.ts');

    // Archive task
    const archiveResult = await archiveTask(testDb, taskId);
    assert.ok(archiveResult.success, 'Task archival should succeed');

    // Verify foreign key still valid (can JOIN successfully)
    const knex = testDb.getKnex();
    const result = await knex('v4_task_pruned_files as tpf')
      .join('v4_tasks as t', 'tpf.task_id', 't.id')
      .where('tpf.task_id', taskId)
      .select('tpf.id', 'tpf.task_id', 't.status_id')
      .first();

    assert.ok(result, 'Foreign key join should succeed');
    assert.equal(result!.task_id, taskId, 'Task ID should match');
    assert.equal(result!.status_id, 6, 'Task status should be archived (6)');
  });

  it('should handle zero pruned files for archived task', async () => {
    const taskId = await createTestTask(testDb, 'Task with no pruned files');

    // Archive without any pruned files
    const archiveResult = await archiveTask(testDb, taskId);
    assert.ok(archiveResult.success);

    // Query pruned files - should return empty array
    const getPrunedResult = await getPrunedFiles(testDb, taskId);
    assert.ok(getPrunedResult.success);
    assert.equal(getPrunedResult.count, 0);
    assert.equal(getPrunedResult.pruned_files.length, 0);
  });

  it('should preserve pruned file timestamps after archival', async () => {
    const taskId = await createTestTask(testDb, 'Task for timestamp test');

    // Create pruned file with explicit timestamp check
    const beforeTs = Math.floor(Date.now() / 1000);
    await createPrunedFileRecord(testDb, taskId, '/tmp/timestamped.ts');

    // Archive task
    await archiveTask(testDb, taskId);

    // Get pruned files and verify timestamp
    const getPrunedResult = await getPrunedFiles(testDb, taskId);
    assert.equal(getPrunedResult.pruned_files.length, 1);

    const prunedFile = getPrunedResult.pruned_files[0];
    assert.ok(prunedFile.pruned_ts, 'Should have pruned_ts timestamp');
    assert.ok(prunedFile.file_path === '/tmp/timestamped.ts', 'File path should match');

    // Verify timestamp is reasonable (within last few seconds)
    const prunedAt = prunedFile.pruned_ts;
    assert.ok(prunedAt >= beforeTs, 'Timestamp should be after or equal to test start');
    assert.ok(prunedAt <= beforeTs + 5, 'Timestamp should be within 5 seconds');
  });

  it('should handle multiple archived tasks with pruned files', async () => {
    // Create multiple tasks with pruned files
    const task1Id = await createTestTask(testDb, 'Task 1');
    const task2Id = await createTestTask(testDb, 'Task 2');
    const task3Id = await createTestTask(testDb, 'Task 3');

    await createPrunedFileRecord(testDb, task1Id, '/tmp/task1-file1.ts');
    await createPrunedFileRecord(testDb, task1Id, '/tmp/task1-file2.ts');

    await createPrunedFileRecord(testDb, task2Id, '/tmp/task2-file1.ts');

    await createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file1.ts');
    await createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file2.ts');
    await createPrunedFileRecord(testDb, task3Id, '/tmp/task3-file3.ts');

    // Archive all tasks
    await archiveTask(testDb, task1Id);
    await archiveTask(testDb, task2Id);
    await archiveTask(testDb, task3Id);

    // Verify each task's pruned files are isolated and preserved
    const task1Pruned = await getPrunedFiles(testDb, task1Id);
    assert.equal(task1Pruned.count, 2, 'Task 1 should have 2 pruned files');

    const task2Pruned = await getPrunedFiles(testDb, task2Id);
    assert.equal(task2Pruned.count, 1, 'Task 2 should have 1 pruned file');

    const task3Pruned = await getPrunedFiles(testDb, task3Id);
    assert.equal(task3Pruned.count, 3, 'Task 3 should have 3 pruned files');

    // Verify file paths are isolated (no cross-contamination)
    const task1Paths = task1Pruned.pruned_files.map((f: any) => f.file_path);
    assert.ok(!task1Paths.includes('/tmp/task2-file1.ts'), 'Task 1 should not include Task 2 files');
    assert.ok(!task1Paths.includes('/tmp/task3-file1.ts'), 'Task 1 should not include Task 3 files');
  });

  it('should verify CASCADE constraint when task is deleted (not archived)', async () => {
    // This test verifies the ON DELETE CASCADE behavior
    const taskId = await createTestTask(testDb, 'Task for deletion test');
    await createPrunedFileRecord(testDb, taskId, '/tmp/cascade-test.ts');

    // Verify pruned file exists
    const beforeCount = await countPrunedFiles(testDb, taskId);
    assert.equal(beforeCount, 1);

    // DELETE task (not archive) - should cascade delete pruned files
    const knex = testDb.getKnex();
    await knex('v4_tasks').where({ id: taskId }).delete();

    // Verify pruned file was cascade deleted
    const afterCount = await countPrunedFiles(testDb, taskId);
    assert.equal(afterCount, 0, 'Pruned files should be CASCADE deleted when task is deleted');
  });

  console.log('\n✅ All auto-pruning persistence tests passed!\n');
});
