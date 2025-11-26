/**
 * Integration Tests - Two-Step Git-Aware Task Workflow (v3.5.2)
 * Tests the complete workflow: staging → done, commit → archived
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { initializeDatabase, closeDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { detectAndCompleteOnStaging, detectAndArchiveOnCommit } from '../../../utils/task-stale-detection.js';

const TEST_DIR = join(process.cwd(), 'test-two-step-git');

// Helper to clean up test directory
function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Two-Step Git-Aware Workflow Integration Tests', () => {
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

    // Add test config for two-step workflow
    await knex('v4_config').insert({ config_key: 'git_auto_complete_on_stage', config_value: '1' })
      .onConflict('config_key').merge();
    await knex('v4_config').insert({ config_key: 'git_auto_archive_on_commit', config_value: '1' })
      .onConflict('config_key').merge();
    await knex('v4_config').insert({ config_key: 'require_all_files_staged', config_value: '1' })
      .onConflict('config_key').merge();
    await knex('v4_config').insert({ config_key: 'require_all_files_committed_for_archive', config_value: '1' })
      .onConflict('config_key').merge();

    // Create test git repository
    mkdirSync(TEST_DIR, { recursive: true });
    execSync('git init', { cwd: TEST_DIR });
    execSync('git config user.email "test@example.com"', { cwd: TEST_DIR });
    execSync('git config user.name "Test User"', { cwd: TEST_DIR });

    // Change to test directory for git operations
    process.chdir(TEST_DIR);
  });

  after(async () => {
    // Close database
    if (db) {
      await closeDatabase();
    }

    // Go back to original directory
    process.chdir(join(TEST_DIR, '..'));

    // Clean up test directory
    cleanupTestDir();
  });

  describe('Step 1: Staging → Done', () => {
    beforeEach(async () => {
      // Clean up tasks and file links from previous tests
      const knex = db.getKnex();
      await knex('v4_task_file_links').delete();
      await knex('v4_task_details').delete();
      await knex('v4_tasks').delete();
    });

    it('should transition task from waiting_review to done when all files staged', async () => {
      const knex = db.getKnex();

      // 1. Create task in waiting_review with watched file
      const [agentId] = await knex('v4_agents').insert({ name: 'test-agent' });
      const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentId,
        status_id: statusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 2. Add watched file
      writeFileSync('test-file1.ts', '// Test content');
      const [fileId] = await knex('v4_files').insert({ path: 'test-file1.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      // 3. Stage the file
      execSync('git add test-file1.ts');

      // 4. Run staging detection
      const completedCount = await detectAndCompleteOnStaging(db);

      // 5. Verify task transitioned to done
      assert.strictEqual(completedCount, 1, 'Should complete 1 task');

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      const doneStatusRow = await knex('v4_task_statuses').where({ name: 'done' }).first('id');

      assert.strictEqual(task.status_id, doneStatusRow.id, 'Task should be in done status');
    });

    it('should NOT transition when only some files are staged', async () => {
      const knex = db.getKnex();

      // 1. Create task with 2 watched files
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: statusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 2. Add 2 watched files
      writeFileSync('test-file2.ts', '// Test content 2');
      writeFileSync('test-file3.ts', '// Test content 3');
      const [file2Id] = await knex('v4_files').insert({ path: 'test-file2.ts' });
      const [file3Id] = await knex('v4_files').insert({ path: 'test-file3.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file2Id, link_type: 'watch' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file3Id, link_type: 'watch' });

      // 3. Stage only ONE file
      execSync('git add test-file2.ts');

      // 4. Run staging detection
      const completedCount = await detectAndCompleteOnStaging(db);

      // 5. Verify task is STILL in waiting_review
      assert.strictEqual(completedCount, 0, 'Should NOT complete any tasks');

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      assert.strictEqual(task.status_id, statusRow.id, 'Task should still be in waiting_review');
    });
  });

  describe('Step 2: Commit → Archived', () => {
    beforeEach(async () => {
      // Clean up tasks and file links from previous tests
      const knex = db.getKnex();
      await knex('v4_task_file_links').delete();
      await knex('v4_task_details').delete();
      await knex('v4_tasks').delete();
    });

    it('should transition task from done to archived when all files committed', async () => {
      const knex = db.getKnex();

      // 1. Commit previously staged files
      execSync('git commit -m "Test commit 1"');

      // 2. Create task in done status with watched file
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const doneStatusRow = await knex('v4_task_statuses').where({ name: 'done' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: doneStatusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 3. Add watched file and commit it
      writeFileSync('test-file4.ts', '// Test content 4');
      const [fileId] = await knex('v4_files').insert({ path: 'test-file4.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      execSync('git add test-file4.ts');
      execSync('git commit -m "Test commit 2"');

      // 4. Run archive detection
      const archivedCount = await detectAndArchiveOnCommit(db);

      // 5. Verify task transitioned to archived
      assert.strictEqual(archivedCount, 1, 'Should archive 1 task');

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      const archivedStatusRow = await knex('v4_task_statuses').where({ name: 'archived' }).first('id');

      assert.strictEqual(task.status_id, archivedStatusRow.id, 'Task should be in archived status');
    });

    it('should NOT archive when files are not committed (only staged)', async () => {
      const knex = db.getKnex();

      // 1. Create task in done status
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const doneStatusRow = await knex('v4_task_statuses').where({ name: 'done' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: doneStatusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 2. Add watched file and ONLY stage it (don't commit)
      writeFileSync('test-file5.ts', '// Test content 5');
      const [fileId] = await knex('v4_files').insert({ path: 'test-file5.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      execSync('git add test-file5.ts');

      // 3. Run archive detection
      const archivedCount = await detectAndArchiveOnCommit(db);

      // 4. Verify task is STILL in done
      assert.strictEqual(archivedCount, 0, 'Should NOT archive any tasks');

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      assert.strictEqual(task.status_id, doneStatusRow.id, 'Task should still be in done status');
    });
  });

  describe('Full Two-Step Workflow', () => {
    beforeEach(async () => {
      // Clean up tasks and file links from previous tests
      const knex = db.getKnex();
      await knex('v4_task_file_links').delete();
      await knex('v4_task_details').delete();
      await knex('v4_tasks').delete();
    });

    it('should complete full cycle: waiting_review → done → archived', async () => {
      const knex = db.getKnex();

      // 1. Create task in waiting_review
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const waitingReviewRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: waitingReviewRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 2. Add watched file
      writeFileSync('test-full-cycle.ts', '// Full cycle test');
      const [fileId] = await knex('v4_files').insert({ path: 'test-full-cycle.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      // 3. STEP 1: Stage file → should transition to done
      execSync('git add test-full-cycle.ts');
      const stagingCompleted = await detectAndCompleteOnStaging(db);
      assert.strictEqual(stagingCompleted, 1);

      let task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      const doneStatusRow = await knex('v4_task_statuses').where({ name: 'done' }).first('id');
      assert.strictEqual(task.status_id, doneStatusRow.id, 'Task should be done after staging');

      // 4. STEP 2: Commit file → should transition to archived
      execSync('git commit -m "Full cycle test"');
      const commitArchived = await detectAndArchiveOnCommit(db);
      assert.strictEqual(commitArchived, 1);

      task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      const archivedStatusRow = await knex('v4_task_statuses').where({ name: 'archived' }).first('id');
      assert.strictEqual(task.status_id, archivedStatusRow.id, 'Task should be archived after commit');
    });

    it('should handle rapid staging + commit (git commit -a)', async () => {
      const knex = db.getKnex();

      // 1. Create task
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const waitingReviewRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: waitingReviewRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      // 2. Add watched file
      writeFileSync('test-rapid.ts', '// Rapid test');
      const [fileId] = await knex('v4_files').insert({ path: 'test-rapid.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      // 3. Stage and commit immediately
      execSync('git add test-rapid.ts && git commit -m "Rapid test"');

      // 4. Run both detections - should go straight to archived
      const stagingCompleted = await detectAndCompleteOnStaging(db);
      // Staging won't find it (already committed)
      assert.strictEqual(stagingCompleted, 0);

      // But commit detection should complete it to done first
      // This is handled by detectAndCompleteReviewedTasks in real workflow
      // For this test, manually transition to done then test archiving
      const doneStatusRow = await knex('v4_task_statuses').where({ name: 'done' }).first('id');
      await knex('v4_tasks').where({ id: taskId }).update({ status_id: doneStatusRow.id });

      const commitArchived = await detectAndArchiveOnCommit(db);
      assert.strictEqual(commitArchived, 1);

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      const archivedStatusRow = await knex('v4_task_statuses').where({ name: 'archived' }).first('id');
      assert.strictEqual(task.status_id, archivedStatusRow.id);
    });
  });

  describe('Configuration Tests', () => {
    beforeEach(async () => {
      // Clean up tasks and file links from previous tests
      const knex = db.getKnex();
      await knex('v4_task_file_links').delete();
      await knex('v4_task_details').delete();
      await knex('v4_tasks').delete();
    });

    it('should respect require_all_files_staged config', async () => {
      const knex = db.getKnex();

      // Set to require all files
      await knex('v4_config').where({ config_key: 'require_all_files_staged' }).update({ config_value: '1' });

      // Create task with 2 files
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: statusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      writeFileSync('config-test1.ts', '// Config test 1');
      writeFileSync('config-test2.ts', '// Config test 2');
      const [file1Id] = await knex('v4_files').insert({ path: 'config-test1.ts' });
      const [file2Id] = await knex('v4_files').insert({ path: 'config-test2.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file1Id, link_type: 'watch' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: file2Id, link_type: 'watch' });

      // Stage only one file
      execSync('git add config-test1.ts');

      // Should NOT complete (require ALL)
      const completed = await detectAndCompleteOnStaging(db);
      assert.strictEqual(completed, 0);

      const task = await knex('v4_tasks').where({ id: taskId }).first('status_id');
      assert.strictEqual(task.status_id, statusRow.id, 'Task should still be waiting_review');
    });

    it('should respect git_auto_complete_on_stage disabled', async () => {
      const knex = db.getKnex();

      // Disable staging auto-complete
      await knex('v4_config').where({ config_key: 'git_auto_complete_on_stage' }).update({ config_value: '0' });

      // Create and stage task
      const agentRow = await knex('v4_agents').where({ name: 'test-agent' }).first('id');
      const statusRow = await knex('v4_task_statuses').where({ name: 'waiting_review' }).first('id');
      const [taskId] = await knex('v4_tasks').insert({
        assigned_agent_id: agentRow.id,
        status_id: statusRow.id,
        priority: 2,
        created_ts: Math.floor(Date.now() / 1000),
        updated_ts: Math.floor(Date.now() / 1000)
      });

      await knex('v4_task_details').insert({ task_id: taskId, title: 'Test task' });

      writeFileSync('disabled-test.ts', '// Disabled test');
      const [fileId] = await knex('v4_files').insert({ path: 'disabled-test.ts' });
      await knex('v4_task_file_links').insert({ task_id: taskId, file_id: fileId, link_type: 'watch' });

      execSync('git add disabled-test.ts');

      // Should NOT complete (feature disabled)
      const completed = await detectAndCompleteOnStaging(db);
      assert.strictEqual(completed, 0);

      // Re-enable for other tests
      await knex('v4_config').where({ config_key: 'git_auto_complete_on_stage' }).update({ config_value: '1' });
    });
  });
});
