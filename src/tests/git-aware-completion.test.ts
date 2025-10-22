/**
 * Git-Aware Auto-Complete Tests (v3.4.0)
 * Tests for detectAndCompleteReviewedTasks function
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initializeSchema } from '../schema.js';
import { detectAndCompleteReviewedTasks } from '../utils/task-stale-detection.js';

const TEST_DB_PATH = join(process.cwd(), 'test-git-aware.db');
const TEST_DIR = join(process.cwd(), 'test-tracking');

// Helper to clean up test database
function cleanupTestDb() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
}

describe('Git-Aware Auto-Complete', () => {
  let db: Database.Database;

  before(() => {
    // Clean up before tests
    cleanupTestDb();

    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema(db);

    // Add test config for git auto-complete
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('git_auto_complete_enabled', '1');
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('require_all_files_committed', '1');

    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    // Close database
    if (db) {
      db.close();
    }

    // Clean up test database and directory
    cleanupTestDb();
  });

  it('should auto-complete task when all watched files are committed', async () => {
    // 1. Create a task in waiting_review status with watched files
    const agentId = db.prepare('INSERT INTO m_agents (name) VALUES (?)').run('test-agent').lastInsertRowid;
    const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
    const taskId = db.prepare(`
      INSERT INTO t_tasks (assigned_agent_id, status_id, priority, created_ts, updated_ts)
      VALUES (?, ?, 2, unixepoch(), unixepoch())
    `).run(agentId, statusId.id).lastInsertRowid;

    db.prepare('INSERT INTO t_task_details (task_id, title) VALUES (?, ?)').run(taskId, 'Test git-aware task');

    // 2. Add watched files
    const file1Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-tracking/file1.ts').lastInsertRowid;
    const file2Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-tracking/file2.ts').lastInsertRowid;

    db.prepare('INSERT INTO t_task_file_links (task_id, file_id, link_type) VALUES (?, ?, ?)').run(taskId, file1Id, 'watch');
    db.prepare('INSERT INTO t_task_file_links (task_id, file_id, link_type) VALUES (?, ?, ?)').run(taskId, file2Id, 'watch');

    // 3. Commit the files to git
    execSync(`touch ${TEST_DIR}/file1.ts`);
    execSync(`touch ${TEST_DIR}/file2.ts`);
    execSync(`git add ${TEST_DIR}/file1.ts ${TEST_DIR}/file2.ts`);
    execSync(`git commit -m "Test commit for git-aware completion"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was auto-completed
    assert.strictEqual(completedCount, 1, 'Should auto-complete 1 task');

    const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
    const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };

    assert.strictEqual(task.status_id, doneStatusId.id, 'Task should be in done status');
  });

  it('should NOT auto-complete task when only some files are committed', async () => {
    // 1. Create a task in waiting_review
    const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
    const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
    const taskId = db.prepare(`
      INSERT INTO t_tasks (assigned_agent_id, status_id, priority, created_ts, updated_ts)
      VALUES (?, ?, 2, unixepoch(), unixepoch())
    `).run(agentId.id, statusId.id).lastInsertRowid;

    db.prepare('INSERT INTO t_task_details (task_id, title) VALUES (?, ?)').run(taskId, 'Partial commit task');

    // 2. Add watched files
    const file3Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-tracking/file3.ts').lastInsertRowid;
    const file4Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-tracking/file4.ts').lastInsertRowid;

    db.prepare('INSERT INTO t_task_file_links (task_id, file_id, link_type) VALUES (?, ?, ?)').run(taskId, file3Id, 'watch');
    db.prepare('INSERT INTO t_task_file_links (task_id, file_id, link_type) VALUES (?, ?, ?)').run(taskId, file4Id, 'watch');

    // 3. Commit only ONE file
    execSync(`touch ${TEST_DIR}/file3.ts`);
    execSync(`git add ${TEST_DIR}/file3.ts`);
    execSync(`git commit -m "Partial commit - only file3"`);

    // 4. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 5. Verify task was NOT auto-completed (still in waiting_review)
    assert.strictEqual(completedCount, 0, 'Should NOT auto-complete task with partial commits');

    const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
    const waitingReviewStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };

    assert.strictEqual(task.status_id, waitingReviewStatusId.id, 'Task should still be in waiting_review status');
  });

  it('should skip tasks with no watched files', async () => {
    // 1. Create a task in waiting_review with NO watched files
    const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
    const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
    const taskId = db.prepare(`
      INSERT INTO t_tasks (assigned_agent_id, status_id, priority, created_ts, updated_ts)
      VALUES (?, ?, 2, unixepoch(), unixepoch())
    `).run(agentId.id, statusId.id).lastInsertRowid;

    db.prepare('INSERT INTO t_task_details (task_id, title) VALUES (?, ?)').run(taskId, 'No watched files task');

    // 2. Run git-aware auto-complete
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 3. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should skip tasks with no watched files');

    const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
    const waitingReviewStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };

    assert.strictEqual(task.status_id, waitingReviewStatusId.id, 'Task should still be in waiting_review status');
  });

  it('should respect git_auto_complete_enabled config', async () => {
    // 1. Disable git auto-complete
    db.prepare('UPDATE m_config SET value = ? WHERE key = ?').run('0', 'git_auto_complete_enabled');

    // 2. Create a task with all files committed
    const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
    const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
    const taskId = db.prepare(`
      INSERT INTO t_tasks (assigned_agent_id, status_id, priority, created_ts, updated_ts)
      VALUES (?, ?, 2, unixepoch(), unixepoch())
    `).run(agentId.id, statusId.id).lastInsertRowid;

    db.prepare('INSERT INTO t_task_details (task_id, title) VALUES (?, ?)').run(taskId, 'Config disabled task');

    const file5Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-tracking/file5.ts').lastInsertRowid;
    db.prepare('INSERT INTO t_task_file_links (task_id, file_id, link_type) VALUES (?, ?, ?)').run(taskId, file5Id, 'watch');

    execSync(`touch ${TEST_DIR}/file5.ts`);
    execSync(`git add ${TEST_DIR}/file5.ts`);
    execSync(`git commit -m "Test with config disabled"`);

    // 3. Run git-aware auto-complete (should skip due to config)
    const completedCount = await detectAndCompleteReviewedTasks(db);

    // 4. Verify no tasks were auto-completed
    assert.strictEqual(completedCount, 0, 'Should respect disabled config');

    // Re-enable for other tests
    db.prepare('UPDATE m_config SET value = ? WHERE key = ?').run('1', 'git_auto_complete_enabled');
  });
});
