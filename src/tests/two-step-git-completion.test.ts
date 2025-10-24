/**
 * Integration Tests - Two-Step Git-Aware Task Workflow (v3.5.2)
 * Tests the complete workflow: staging → done, commit → archived
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { unlinkSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initializeSchema } from '../schema.js';
import { detectAndCompleteOnStaging, detectAndArchiveOnCommit } from '../utils/task-stale-detection.js';

const TEST_DB_PATH = join(process.cwd(), 'test-two-step-workflow.db');
const TEST_DIR = join(process.cwd(), 'test-two-step-git');

// Helper to clean up test database
function cleanupTestDb() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
}

// Helper to clean up test directory
function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Two-Step Git-Aware Workflow Integration Tests', () => {
  let db: Database.Database;

  before(() => {
    // Clean up before tests
    cleanupTestDb();
    cleanupTestDir();

    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema(db);

    // Create 'system' agent (required for activity log triggers)
    db.prepare('INSERT INTO m_agents (name) VALUES (?)').run('system');

    // Add test config for two-step workflow
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('git_auto_complete_on_stage', '1');
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('git_auto_archive_on_commit', '1');
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('require_all_files_staged', '1');
    db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run('require_all_files_committed_for_archive', '1');

    // Create test git repository
    mkdirSync(TEST_DIR, { recursive: true });
    execSync('git init', { cwd: TEST_DIR });
    execSync('git config user.email "test@example.com"', { cwd: TEST_DIR });
    execSync('git config user.name "Test User"', { cwd: TEST_DIR });

    // Change to test directory for git operations
    process.chdir(TEST_DIR);
  });

  after(() => {
    // Close database
    if (db) {
      db.close();
    }

    // Go back to original directory
    process.chdir(join(TEST_DIR, '..'));

    // Clean up test database and directory
    cleanupTestDb();
    cleanupTestDir();
  });

  describe('Step 1: Staging → Done', () => {
    beforeEach(() => {
      // Clean up tasks and file links from previous tests
      db.prepare('DELETE FROM t_task_file_links').run();
      db.prepare('DELETE FROM t_tasks').run();
    });

    it('should transition task from waiting_review to done when all files staged', async () => {
      // 1. Create task in waiting_review with watched file
      const agentId = db.prepare('INSERT INTO m_agents (name) VALUES (?)').run('test-agent').lastInsertRowid;
      const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId, statusId.id).lastInsertRowid;

      // 2. Add watched file
      writeFileSync('test-file1.ts', '// Test content');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-file1.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      // 3. Stage the file
      execSync('git add test-file1.ts');

      // 4. Run staging detection
      const completedCount = await detectAndCompleteOnStaging(db);

      // 5. Verify task transitioned to done
      assert.strictEqual(completedCount, 1, 'Should complete 1 task');

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };

      assert.strictEqual(task.status_id, doneStatusId.id, 'Task should be in done status');
    });

    it('should NOT transition when only some files are staged', async () => {
      // 1. Create task with 2 watched files
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, statusId.id).lastInsertRowid;

      // 2. Add 2 watched files
      writeFileSync('test-file2.ts', '// Test content 2');
      writeFileSync('test-file3.ts', '// Test content 3');
      const file2Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-file2.ts').lastInsertRowid;
      const file3Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-file3.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, file2Id);
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, file3Id);

      // 3. Stage only ONE file
      execSync('git add test-file2.ts');

      // 4. Run staging detection
      const completedCount = await detectAndCompleteOnStaging(db);

      // 5. Verify task is STILL in waiting_review
      assert.strictEqual(completedCount, 0, 'Should NOT complete any tasks');

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      assert.strictEqual(task.status_id, statusId.id, 'Task should still be in waiting_review');
    });
  });

  describe('Step 2: Commit → Archived', () => {
    beforeEach(() => {
      // Clean up tasks and file links from previous tests
      db.prepare('DELETE FROM t_task_file_links').run();
      db.prepare('DELETE FROM t_tasks').run();
    });

    it('should transition task from done to archived when all files committed', async () => {
      // 1. Commit previously staged files
      execSync('git commit -m "Test commit 1"');

      // 2. Create task in done status with watched file
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, doneStatusId.id).lastInsertRowid;

      // 3. Add watched file and commit it
      writeFileSync('test-file4.ts', '// Test content 4');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-file4.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      execSync('git add test-file4.ts');
      execSync('git commit -m "Test commit 2"');

      // 4. Run archive detection
      const archivedCount = await detectAndArchiveOnCommit(db);

      // 5. Verify task transitioned to archived
      assert.strictEqual(archivedCount, 1, 'Should archive 1 task');

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      const archivedStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('archived') as { id: number };

      assert.strictEqual(task.status_id, archivedStatusId.id, 'Task should be in archived status');
    });

    it('should NOT archive when files are not committed (only staged)', async () => {
      // 1. Create task in done status
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, doneStatusId.id).lastInsertRowid;

      // 2. Add watched file and ONLY stage it (don't commit)
      writeFileSync('test-file5.ts', '// Test content 5');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-file5.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      execSync('git add test-file5.ts');

      // 3. Run archive detection
      const archivedCount = await detectAndArchiveOnCommit(db);

      // 4. Verify task is STILL in done
      assert.strictEqual(archivedCount, 0, 'Should NOT archive any tasks');

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      assert.strictEqual(task.status_id, doneStatusId.id, 'Task should still be in done status');
    });
  });

  describe('Full Two-Step Workflow', () => {
    beforeEach(() => {
      // Clean up tasks and file links from previous tests
      db.prepare('DELETE FROM t_task_file_links').run();
      db.prepare('DELETE FROM t_tasks').run();
    });

    it('should complete full cycle: waiting_review → done → archived', async () => {
      // 1. Create task in waiting_review
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const waitingReviewId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, waitingReviewId.id).lastInsertRowid;

      // 2. Add watched file
      writeFileSync('test-full-cycle.ts', '// Full cycle test');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-full-cycle.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      // 3. STEP 1: Stage file → should transition to done
      execSync('git add test-full-cycle.ts');
      const stagingCompleted = await detectAndCompleteOnStaging(db);
      assert.strictEqual(stagingCompleted, 1);

      let task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };
      assert.strictEqual(task.status_id, doneStatusId.id, 'Task should be done after staging');

      // 4. STEP 2: Commit file → should transition to archived
      execSync('git commit -m "Full cycle test"');
      const commitArchived = await detectAndArchiveOnCommit(db);
      assert.strictEqual(commitArchived, 1);

      task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      const archivedStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('archived') as { id: number };
      assert.strictEqual(task.status_id, archivedStatusId.id, 'Task should be archived after commit');
    });

    it('should handle rapid staging + commit (git commit -a)', async () => {
      // 1. Create task
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const waitingReviewId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, waitingReviewId.id).lastInsertRowid;

      // 2. Add watched file
      writeFileSync('test-rapid.ts', '// Rapid test');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('test-rapid.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      // 3. Stage and commit immediately
      execSync('git add test-rapid.ts && git commit -m "Rapid test"');

      // 4. Run both detections - should go straight to archived
      const stagingCompleted = await detectAndCompleteOnStaging(db);
      // Staging won't find it (already committed)
      assert.strictEqual(stagingCompleted, 0);

      // But commit detection should complete it to done first
      // This is handled by detectAndCompleteReviewedTasks in real workflow
      // For this test, manually transition to done then test archiving
      const doneStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('done') as { id: number };
      db.prepare('UPDATE t_tasks SET status_id = ? WHERE id = ?').run(doneStatusId.id, taskId);

      const commitArchived = await detectAndArchiveOnCommit(db);
      assert.strictEqual(commitArchived, 1);

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      const archivedStatusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('archived') as { id: number };
      assert.strictEqual(task.status_id, archivedStatusId.id);
    });
  });

  describe('Configuration Tests', () => {
    beforeEach(() => {
      // Clean up tasks and file links from previous tests
      db.prepare('DELETE FROM t_task_file_links').run();
      db.prepare('DELETE FROM t_tasks').run();
    });

    it('should respect require_all_files_staged config', async () => {
      // Set to require all files
      db.prepare('UPDATE m_config SET value = ? WHERE key = ?').run('1', 'require_all_files_staged');

      // Create task with 2 files
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, statusId.id).lastInsertRowid;

      writeFileSync('config-test1.ts', '// Config test 1');
      writeFileSync('config-test2.ts', '// Config test 2');
      const file1Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('config-test1.ts').lastInsertRowid;
      const file2Id = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('config-test2.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, file1Id);
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, file2Id);

      // Stage only one file
      execSync('git add config-test1.ts');

      // Should NOT complete (require ALL)
      const completed = await detectAndCompleteOnStaging(db);
      assert.strictEqual(completed, 0);

      const task = db.prepare('SELECT status_id FROM t_tasks WHERE id = ?').get(taskId) as { status_id: number };
      assert.strictEqual(task.status_id, statusId.id, 'Task should still be waiting_review');
    });

    it('should respect git_auto_complete_on_stage disabled', async () => {
      // Disable staging auto-complete
      db.prepare('UPDATE m_config SET value = ? WHERE key = ?').run('0', 'git_auto_complete_on_stage');

      // Create and stage task
      const agentId = db.prepare('SELECT id FROM m_agents WHERE name = ?').get('test-agent') as { id: number };
      const statusId = db.prepare('SELECT id FROM m_task_statuses WHERE name = ?').get('waiting_review') as { id: number };
      const taskId = db.prepare(`
        INSERT INTO t_tasks (title, assigned_agent_id, status_id, priority, created_ts, updated_ts)
        VALUES ('Test task', ?, ?, 2, unixepoch(), unixepoch())
      `).run(agentId.id, statusId.id).lastInsertRowid;

      writeFileSync('disabled-test.ts', '// Disabled test');
      const fileId = db.prepare('INSERT INTO m_files (path) VALUES (?)').run('disabled-test.ts').lastInsertRowid;
      db.prepare('INSERT INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

      execSync('git add disabled-test.ts');

      // Should NOT complete (feature disabled)
      const completed = await detectAndCompleteOnStaging(db);
      assert.strictEqual(completed, 0);

      // Re-enable for other tests
      db.prepare('UPDATE m_config SET value = ? WHERE key = ?').run('1', 'git_auto_complete_on_stage');
    });
  });
});
