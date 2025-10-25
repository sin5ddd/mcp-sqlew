/**
 * Git-Aware Auto-Complete Tests (v3.4.0)
 * Tests for detectAndCompleteReviewedTasks function
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initializeDatabase, closeDatabase } from '../database.js';
import type { DatabaseAdapter } from '../adapters/types.js';
import { detectAndCompleteReviewedTasks } from '../utils/task-stale-detection.js';

const TEST_DIR = join(process.cwd(), 'test-tracking');

// Helper to clean up test directory
function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Git-Aware Auto-Complete', () => {
  let db: DatabaseAdapter;

  before(async () => {
    // Clean up before tests
    cleanupTestDir();

    // Create test database (in-memory)
    db = await initializeDatabase({
      databaseType: 'sqlite',
      connection: {
        filename: ':memory:'
      }
    });

    const knex = db.getKnex();

    // Add test config for git auto-complete
    await knex('m_config').insert({ key: 'git_auto_complete_enabled', value: '1' })
      .onConflict('key').merge();
    await knex('m_config').insert({ key: 'require_all_files_committed', value: '1' })
      .onConflict('key').merge();

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
  });

  it('should auto-complete task when all watched files are committed', async () => {
    const knex = db.getKnex();

    // 1. Create a task in waiting_review status with watched files
    const [agentId] = await knex('m_agents').insert({ name: 'test-agent' });
    const statusRow = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('t_tasks').insert({
      assigned_agent_id: agentId,
      status_id: statusRow.id,
      priority: 2,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    await knex('t_task_details').insert({ task_id: taskId, title: 'Test git-aware task' });

    // 2. Add watched files
    const [file1Id] = await knex('m_files').insert({ path: 'test-tracking/file1.ts' });
    const [file2Id] = await knex('m_files').insert({ path: 'test-tracking/file2.ts' });

    await knex('t_task_file_links').insert({ task_id: taskId, file_id: file1Id, link_type: 'watch' });
    await knex('t_task_file_links').insert({ task_id: taskId, file_id: file2Id, link_type: 'watch' });

    // 3. Commit the files to git
    execSync(`touch ${TEST_DIR}/file1.ts`);
    execSync(`touch ${TEST_DIR}/file2.ts`);
    execSync(`git add ${TEST_DIR}/file1.ts ${TEST_DIR}/file2.ts`);
    execSync(`git commit -m "Test commit for git-aware completion"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was auto-completed
    assert.strictEqual(completedCount, 1, 'Should auto-complete 1 task');

    const task = await knex('t_tasks').where({ id: taskId }).first('status_id');
    const doneStatus = await knex('m_task_statuses').where({ name: 'done' }).first('id');

    assert.strictEqual(task.status_id, doneStatus.id, 'Task should be in done status');
  });

  it('should NOT auto-complete task when only some files are committed', async () => {
    const knex = db.getKnex();

    // 1. Create a task in waiting_review
    const agent = await knex('m_agents').where({ name: 'test-agent' }).first('id');
    const statusRow = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('t_tasks').insert({
      assigned_agent_id: agent.id,
      status_id: statusRow.id,
      priority: 2,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    await knex('t_task_details').insert({ task_id: taskId, title: 'Partial commit task' });

    // 2. Add watched files
    const [file3Id] = await knex('m_files').insert({ path: 'test-tracking/file3.ts' });
    const [file4Id] = await knex('m_files').insert({ path: 'test-tracking/file4.ts' });

    await knex('t_task_file_links').insert({ task_id: taskId, file_id: file3Id, link_type: 'watch' });
    await knex('t_task_file_links').insert({ task_id: taskId, file_id: file4Id, link_type: 'watch' });

    // 3. Commit only ONE file
    execSync(`touch ${TEST_DIR}/file3.ts`);
    execSync(`git add ${TEST_DIR}/file3.ts`);
    execSync(`git commit -m "Partial commit - only file3"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was NOT auto-completed (still in waiting_review)
    assert.strictEqual(completedCount, 0, 'Should NOT auto-complete task with partial commits');

    const task = await knex('t_tasks').where({ id: taskId }).first('status_id');
    const waitingReviewStatus = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');

    assert.strictEqual(task.status_id, waitingReviewStatus.id, 'Task should still be in waiting_review status');
  });

  it('should skip tasks with no watched files', async () => {
    const knex = db.getKnex();

    // 1. Create a task in waiting_review with NO watched files
    const agent = await knex('m_agents').where({ name: 'test-agent' }).first('id');
    const statusRow = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('t_tasks').insert({
      assigned_agent_id: agent.id,
      status_id: statusRow.id,
      priority: 2,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    await knex('t_task_details').insert({ task_id: taskId, title: 'No watched files task' });

    // 2. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 3. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should skip tasks with no watched files');

    const task = await knex('t_tasks').where({ id: taskId }).first('status_id');
    const waitingReviewStatus = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');

    assert.strictEqual(task.status_id, waitingReviewStatus.id, 'Task should still be in waiting_review status');
  });

  it('should respect git_auto_complete_enabled config', async () => {
    const knex = db.getKnex();

    // 1. Disable git auto-complete
    await knex('m_config').where({ key: 'git_auto_complete_enabled' }).update({ value: '0' });

    // 2. Create a task with all files committed
    const agent = await knex('m_agents').where({ name: 'test-agent' }).first('id');
    const statusRow = await knex('m_task_statuses').where({ name: 'waiting_review' }).first('id');
    const [taskId] = await knex('t_tasks').insert({
      assigned_agent_id: agent.id,
      status_id: statusRow.id,
      priority: 2,
      created_ts: Math.floor(Date.now() / 1000),
      updated_ts: Math.floor(Date.now() / 1000)
    });

    await knex('t_task_details').insert({ task_id: taskId, title: 'Config disabled task' });

    const [file5Id] = await knex('m_files').insert({ path: 'test-tracking/file5.ts' });
    await knex('t_task_file_links').insert({ task_id: taskId, file_id: file5Id, link_type: 'watch' });

    execSync(`touch ${TEST_DIR}/file5.ts`);
    execSync(`git add ${TEST_DIR}/file5.ts`);
    execSync(`git commit -m "Test with config disabled"`);

    // 3. Run git-aware auto-complete (should skip due to config)
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 4. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should respect disabled config');

    // Re-enable for other tests
    await knex('m_config').where({ key: 'git_auto_complete_enabled' }).update({ value: '1' });
  });
});
