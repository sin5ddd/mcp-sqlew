/**
 * Git-Aware Auto-Complete Tests (v3.4.0)
 * Tests for detectAndCompleteReviewedTasks function
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initializeDatabase, closeDatabase, setConfigValue } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { detectAndCompleteReviewedTasks } from '../../../utils/task-stale-detection.js';
import { ProjectContext } from '../../../utils/project-context.js';

const TEST_DIR = join(process.cwd(), 'test-tracking');

// Helper to clean up test directory
function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Helper to get current git HEAD hash
function getGitHead(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// Helper to reset git to a specific commit
function resetGitTo(commitHash: string) {
  try {
    execSync(`git reset --hard ${commitHash}`, { stdio: 'ignore' });
  } catch {
    // Ignore errors (e.g., if reset fails)
  }
}

describe('Git-Aware Auto-Complete', () => {
  let db: DatabaseAdapter;
  let initialGitHead: string | null = null;

  before(async () => {
    // Record initial git HEAD to reset after tests (cleanup test commits)
    initialGitHead = getGitHead();

    // Clean up before tests
    cleanupTestDir();

    // Configure git user for test commits (required if not set globally)
    try {
      execSync('git config user.email 2>/dev/null || git config user.email "test@example.com"', { stdio: 'ignore' });
      execSync('git config user.name 2>/dev/null || git config user.name "Test User"', { stdio: 'ignore' });
    } catch {
      // Ignore - may already be configured
    }

    // Create test database (in-memory)
    db = await initializeDatabase({
      databaseType: 'sqlite',
      connection: {
        filename: ':memory:'
      }
    });

    const knex = db.getKnex();

    // Initialize ProjectContext (required for v3.7.0+ multi-project support)
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-git-aware-completion', 'config', {
      projectRootPath: process.cwd(),
    });

    // Add test config for git auto-complete (v4.0: in-memory config)
    await setConfigValue(db, 'git_auto_complete_enabled', '1');
    await setConfigValue(db, 'require_all_files_committed', '1');

    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(async () => {
    // Close database
    if (db) {
      await closeDatabase();
    }

    // Clean up test directory
    cleanupTestDir();

    // Reset git to initial HEAD to drop test commits
    if (initialGitHead) {
      resetGitTo(initialGitHead);
    }
  });

  it('should auto-complete task when all watched files are committed', async () => {
    const knex = db.getKnex();
    const projectId = ProjectContext.getInstance().getProjectId();

    // 1. Create a task in waiting_review status with watched files
    const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('v4_tasks').insert({
      title: 'Test git-aware task',
      status_id: statusRow.id,
      priority: 2,
      project_id: projectId,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    // 2. Add watched files
    const [file1Id] = await knex('v4_files').insert({ path: 'test-tracking/file1.ts' });
    const [file2Id] = await knex('v4_files').insert({ path: 'test-tracking/file2.ts' });

    await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file1Id, project_id: projectId, linked_ts: Math.floor(Date.now() / 1000) });
    await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file2Id, project_id: projectId, linked_ts: Math.floor(Date.now() / 1000) });

    // 3. Commit the files to git
    execSync(`touch ${TEST_DIR}/file1.ts`);
    execSync(`touch ${TEST_DIR}/file2.ts`);
    execSync(`git add ${TEST_DIR}/file1.ts ${TEST_DIR}/file2.ts`);
    execSync(`git commit -m "Test commit for git-aware completion"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was auto-completed
    assert.strictEqual(completedCount, 1, 'Should auto-complete 1 task');

    const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
    const doneStatus = await knex('v4_task_statuses').where({ name: 'done' }).first('id');

    assert.strictEqual(task.status_id, doneStatus.id, 'Task should be in done status');
  });

  it('should NOT auto-complete task when only some files are committed', async () => {
    const knex = db.getKnex();
    const projectId = ProjectContext.getInstance().getProjectId();

    // 1. Create a task in waiting_review
    const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('v4_tasks').insert({
      title: 'Partial commit task',
      status_id: statusRow.id,
      priority: 2,
      project_id: projectId,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    // 2. Add watched files
    const [file3Id] = await knex('v4_files').insert({ path: 'test-tracking/file3.ts' });
    const [file4Id] = await knex('v4_files').insert({ path: 'test-tracking/file4.ts' });

    await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file3Id, project_id: projectId, linked_ts: Math.floor(Date.now() / 1000) });
    await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file4Id, project_id: projectId, linked_ts: Math.floor(Date.now() / 1000) });

    // 3. Commit only ONE file
    execSync(`touch ${TEST_DIR}/file3.ts`);
    execSync(`git add ${TEST_DIR}/file3.ts`);
    execSync(`git commit -m "Partial commit - only file3"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was NOT auto-completed (still in waiting_review)
    assert.strictEqual(completedCount, 0, 'Should NOT auto-complete task with partial commits');

    const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
    const waitingReviewStatus = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');

    assert.strictEqual(task.status_id, waitingReviewStatus.id, 'Task should still be in waiting_review status');
  });

  it('should skip tasks with no watched files', async () => {
    const knex = db.getKnex();
    const projectId = ProjectContext.getInstance().getProjectId();

    // 1. Create a task in waiting_review with NO watched files
    const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('v4_tasks').insert({
      title: 'No watched files task',
      status_id: statusRow.id,
      priority: 2,
      project_id: projectId,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    // 2. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 3. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should skip tasks with no watched files');

    const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
    const waitingReviewStatus = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');

    assert.strictEqual(task.status_id, waitingReviewStatus.id, 'Task should still be in waiting_review status');
  });

  it('should respect git_auto_complete_enabled config', async () => {
    const knex = db.getKnex();
    const projectId = ProjectContext.getInstance().getProjectId();

    // 1. Disable git auto-complete (v4.0: in-memory config)
    await setConfigValue(db, 'git_auto_complete_enabled', '0');

    // 2. Create a task with all files committed
    const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('v4_tasks').insert({
      title: 'Config disabled task',
      status_id: statusRow.id,
      priority: 2,
      project_id: projectId,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    const [file5Id] = await knex('v4_files').insert({ path: 'test-tracking/file5.ts' });
    await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file5Id, project_id: projectId, linked_ts: Math.floor(Date.now() / 1000) });

    execSync(`touch ${TEST_DIR}/file5.ts`);
    execSync(`git add ${TEST_DIR}/file5.ts`);
    execSync(`git commit -m "Test with config disabled"`);

    // 3. Run git-aware auto-complete (should skip due to config)
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 4. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should respect disabled config');

    // Re-enable for other tests (v4.0: in-memory config)
    await setConfigValue(db, 'git_auto_complete_enabled', '1');
  });
});
