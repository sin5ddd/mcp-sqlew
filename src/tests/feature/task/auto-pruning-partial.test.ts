/**
 * Integration test for v3.5.0 Auto-Pruning feature
 * Tests partial pruning scenario: keeps existing files, removes non-existent ones
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, getOrCreateAgent, getOrCreateFile, closeDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { detectAndTransitionToReview } from '../../../utils/task-stale-detection.js';
import { ProjectContext } from '../../../utils/project-context.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Auto-pruning: Partial file existence', () => {
  let db: DatabaseAdapter;
  let tempDir: string;
  let tempDbPath: string;
  let testCount = 0;
  const totalTests = 4; // Total number of tests in this suite

  beforeEach(async () => {
    // Create temp directory for test files and database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlew-test-'));
    tempDbPath = path.join(tempDir, 'test.db');

    // Initialize database with Knex adapter
    db = await initializeDatabase({
      databaseType: 'sqlite',
      connection: {
        filename: tempDbPath,
      },
    });

    // Reset and re-initialize ProjectContext after creating new database
    ProjectContext.reset();
    const knex = db.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-auto-pruning-partial', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  afterEach(async () => {
    testCount++;

    await closeDatabase();
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Detect if running filtered tests (IDE scenario with --test-name-pattern)
    const isFilteredTest = process.argv.some(arg => arg.includes('--test-name-pattern'));
  });

  it('should prune non-existent files and keep existing ones', async () => {
    // 1. Create test task
    const taskId = await createTestTask(db);

    // 2. Create 4 watched files (2 exist, 2 don't)
    const existingFile1 = path.join(tempDir, 'exists1.ts');
    const existingFile2 = path.join(tempDir, 'exists2.ts');
    const nonExistentFile1 = path.join(tempDir, 'missing1.ts');
    const nonExistentFile2 = path.join(tempDir, 'missing2.ts');

    fs.writeFileSync(existingFile1, '// test file 1');
    fs.writeFileSync(existingFile2, '// test file 2');
    // Don't create nonExistentFile1 and nonExistentFile2

    // Add all 4 files to watch list
    await addWatchedFiles(db, taskId, [
      existingFile1,
      existingFile2,
      nonExistentFile1,
      nonExistentFile2,
    ]);

    // Set task to in_progress status and update timestamp to be old enough
    // for auto-transition (older than 15 minutes, which is the default review_idle_minutes)
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60 + 10);
    const knex = db.getKnex();
    await knex('v4_tasks')
      .where({ id: taskId })
      .update({
        status_id: 2,
        updated_ts: fifteenMinutesAgo,
      });

    // 3. Trigger auto-pruning by detecting ready for review
    // Change cwd to tempDir so file existence checks work correctly
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);

      const transitioned = await detectAndTransitionToReview(db);

      // Task should have transitioned
      assert.equal(transitioned, 1, 'Should have transitioned 1 task');

      // 4. Verify results

      // Check watch list - should have only 2 files (the existing ones)
      const watchedFiles = await getWatchedFiles(db, taskId);
      assert.equal(watchedFiles.length, 2, 'Should have 2 files in watch list');
      assert.ok(
        watchedFiles.includes('exists1.ts'),
        'Should keep existing file 1'
      );
      assert.ok(
        watchedFiles.includes('exists2.ts'),
        'Should keep existing file 2'
      );

      // Check pruned files table - should have 2 records
      const prunedFiles = await knex('v4_task_pruned_files')
        .where({ task_id: taskId })
        .select('file_path');

      assert.equal(prunedFiles.length, 2, 'Should have 2 pruned file records');

      // Verify pruned files are the correct ones
      const prunedPaths = prunedFiles.map((f) => f.file_path);
      assert.ok(
        prunedPaths.includes('missing1.ts'),
        'Should have pruned missing1.ts'
      );
      assert.ok(
        prunedPaths.includes('missing2.ts'),
        'Should have pruned missing2.ts'
      );

      // Check task status transitioned to waiting_review
      const task = await knex('v4_tasks')
        .where({ id: taskId })
        .first('status_id');
      assert.equal(
        task.status_id,
        3,
        'Task should be in waiting_review status (3)'
      );
    } finally {
      // Restore original cwd
      process.chdir(originalCwd);
    }
  });

  it('should not transition if all files are non-existent', async () => {
    // 1. Create test task
    const taskId = await createTestTask(db);

    // 2. Create 2 watched files that don't exist
    const nonExistentFile1 = path.join(tempDir, 'missing1.ts');
    const nonExistentFile2 = path.join(tempDir, 'missing2.ts');
    // Don't create these files

    // Add files to watch list
    await addWatchedFiles(db, taskId, [nonExistentFile1, nonExistentFile2]);

    // Set task to in_progress status and update timestamp to be old enough
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60 + 10);
    const knex = db.getKnex();
    await knex('v4_tasks')
      .where({ id: taskId })
      .update({
        status_id: 2,
        updated_ts: fifteenMinutesAgo,
      });

    // 3. Trigger auto-pruning
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);

      const transitioned = await detectAndTransitionToReview(db);

      // Task should NOT have transitioned (safety check prevents it)
      assert.equal(transitioned, 0, 'Should not have transitioned any tasks');

      // 4. Verify task is still in in_progress
      const task = await knex('v4_tasks')
        .where({ id: taskId })
        .first('status_id');
      assert.equal(task.status_id, 2, 'Task should still be in in_progress (2)');

      // 5. Verify no pruning occurred (safety check blocked it)
      const prunedFiles = await knex('v4_task_pruned_files')
        .where({ task_id: taskId })
        .count('* as count')
        .first();
      assert.ok(prunedFiles, 'Should have pruned files result');
      assert.equal(
        prunedFiles.count,
        0,
        'Should have 0 pruned records (safety check prevented pruning)'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should not prune when all files exist', async () => {
    // 1. Create test task
    const taskId = await createTestTask(db);

    // 2. Create 3 watched files that all exist
    const existingFile1 = path.join(tempDir, 'exists1.ts');
    const existingFile2 = path.join(tempDir, 'exists2.ts');
    const existingFile3 = path.join(tempDir, 'exists3.ts');

    fs.writeFileSync(existingFile1, '// test file 1');
    fs.writeFileSync(existingFile2, '// test file 2');
    fs.writeFileSync(existingFile3, '// test file 3');

    // Add files to watch list
    await addWatchedFiles(db, taskId, [
      existingFile1,
      existingFile2,
      existingFile3,
    ]);

    // Set task to in_progress status and update timestamp to be old enough
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60 + 10);
    const knex = db.getKnex();
    await knex('v4_tasks')
      .where({ id: taskId })
      .update({
        status_id: 2,
        updated_ts: fifteenMinutesAgo,
      });

    // 3. Trigger auto-pruning
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);

      const transitioned = await detectAndTransitionToReview(db);

      // Task should have transitioned (all files exist)
      assert.equal(transitioned, 1, 'Should have transitioned 1 task');

      // 4. Verify no pruning occurred
      const prunedFiles = await knex('v4_task_pruned_files')
        .where({ task_id: taskId })
        .count('* as count')
        .first();
      assert.ok(prunedFiles, 'Should have pruned files result');
      assert.equal(prunedFiles.count, 0, 'Should have 0 pruned records');

      // 5. Verify all files still in watch list
      const watchedFiles = await getWatchedFiles(db, taskId);
      assert.equal(watchedFiles.length, 3, 'Should still have 3 files in watch list');

      // 6. Verify task transitioned to waiting_review
      const task = await knex('v4_tasks')
        .where({ id: taskId })
        .first('status_id');
      assert.equal(
        task.status_id,
        3,
        'Task should be in waiting_review status (3)'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle mixed ratios (3 exist, 1 missing)', async () => {
    // 1. Create test task
    const taskId = await createTestTask(db);

    // 2. Create 4 watched files (3 exist, 1 doesn't)
    const existingFile1 = path.join(tempDir, 'exists1.ts');
    const existingFile2 = path.join(tempDir, 'exists2.ts');
    const existingFile3 = path.join(tempDir, 'exists3.ts');
    const nonExistentFile = path.join(tempDir, 'missing.ts');

    fs.writeFileSync(existingFile1, '// test file 1');
    fs.writeFileSync(existingFile2, '// test file 2');
    fs.writeFileSync(existingFile3, '// test file 3');
    // Don't create nonExistentFile

    // Add all files to watch list
    await addWatchedFiles(db, taskId, [
      existingFile1,
      existingFile2,
      existingFile3,
      nonExistentFile,
    ]);

    // Set task to in_progress status and update timestamp to be old enough
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - (15 * 60 + 10);
    const knex = db.getKnex();
    await knex('v4_tasks')
      .where({ id: taskId })
      .update({
        status_id: 2,
        updated_ts: fifteenMinutesAgo,
      });

    // 3. Trigger auto-pruning
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);

      const transitioned = await detectAndTransitionToReview(db);

      // Task should have transitioned
      assert.equal(transitioned, 1, 'Should have transitioned 1 task');

      // 4. Verify results
      const watchedFiles = await getWatchedFiles(db, taskId);
      assert.equal(watchedFiles.length, 3, 'Should have 3 files in watch list');

      const prunedFiles = await knex('v4_task_pruned_files')
        .where({ task_id: taskId })
        .select('file_path');
      assert.equal(prunedFiles.length, 1, 'Should have 1 pruned file record');
      assert.equal(
        prunedFiles[0].file_path,
        'missing.ts',
        'Should have pruned missing.ts'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});

// Helper functions

/**
 * Create a test task in in_progress status
 */
async function createTestTask(db: DatabaseAdapter): Promise<number> {
  const agentId = await getOrCreateAgent(db, 'test-agent');
  const knex = db.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();
  const now = Math.floor(Date.now() / 1000);

  const [taskId] = await knex('v4_tasks').insert({
    title: 'Test Task for Auto-Pruning',
    status_id: 2,
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
 * Add watched files to a task
 */
async function addWatchedFiles(
  db: DatabaseAdapter,
  taskId: number,
  filePaths: string[]
): Promise<void> {
  const knex = db.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();
  const now = Math.floor(Date.now() / 1000);

  for (const filePath of filePaths) {
    // Extract just the filename (last segment) for relative paths
    const fileName = path.basename(filePath);
    const fileId = await getOrCreateFile(db, 1, fileName);

    await knex('v4_task_file_links')
      .insert({
        task_id: taskId,
        file_id: fileId,
        project_id: projectId,  // Required after v3.8.0
        linked_ts: now,  // Required after v3.8.0
      })
      .onConflict(['project_id', 'task_id', 'file_id'])  // Fixed for v3.8.0 UNIQUE constraint
      .ignore();
  }
}

/**
 * Get watched files for a task
 */
async function getWatchedFiles(db: DatabaseAdapter, taskId: number): Promise<string[]> {
  const knex = db.getKnex();

  const files = await knex('v4_task_file_links as tfl')
    .join('v4_files as mf', 'tfl.file_id', 'mf.id')
    .where('tfl.task_id', taskId)
    .select('mf.path');

  return files.map((row) => row.path);
}
