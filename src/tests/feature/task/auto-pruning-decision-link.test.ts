/**
 * Integration tests for Decision Linking to Pruned Files (v3.5.0 Auto-Pruning)
 * Tests the workflow of linking decisions to pruned files for WHY reasoning (project archaeology)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../../../database/index.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { setDecision } from '../../../tools/context/index.js';
import { getPrunedFiles, linkPrunedFile } from '../../../tools/tasks/index.js';
import { ProjectContext } from '../../../utils/project-context.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;

/**
 * Create an in-memory test database
 */
async function createTestDatabase(): Promise<DatabaseAdapter> {
  // Use unique temp file for each test run to ensure clean state
  const tmpDir = path.join(process.cwd(), '.sqlew', 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const dbPath = path.join(tmpDir, `test-auto-pruning-${Date.now()}.db`);

  const adapter = await initializeDatabase({
    databaseType: 'sqlite',
    connection: { filename: dbPath }
  });

  // Project context setup moved to beforeEach to ensure proper singleton reset
  return adapter;
}

/**
 * Helper: Create a test task
 * Note: Agent tracking removed in v4.0
 */
async function createTestTask(adapter: DatabaseAdapter, title: string): Promise<number> {
  const statusId = 2; // in_progress
  const knex = adapter.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();
  const now = Math.floor(Date.now() / 1000);

  const [id] = await knex('v4_tasks').insert({
    title,
    status_id: statusId,
    priority: 2,
    project_id: projectId,  // Required after v3.7.0
    created_ts: now,  // Required NOT NULL field
    updated_ts: now   // Required NOT NULL field
  });

  return id;
}

/**
 * Helper: Create a pruned file record
 */
async function createPrunedFileRecord(adapter: DatabaseAdapter, taskId: number, filePath: string): Promise<number> {
  const knex = adapter.getKnex();
  const projectId = ProjectContext.getInstance().getProjectId();

  const [id] = await knex('v4_task_pruned_files').insert({
    task_id: taskId,
    file_path: filePath,
    pruned_ts: Math.floor(Date.now() / 1000),  // Unix epoch timestamp
    project_id: projectId  // Required after v3.7.0
  });

  return id;
}

describe('Auto-pruning: Decision linking workflow', () => {
  let testCount = 0;
  const totalTests = 9; // Total number of tests in this suite

  beforeEach(async () => {
    testDb = await createTestDatabase();
    // Reset and re-initialize ProjectContext after creating new database
    // This ensures the singleton points to the current test's database
    ProjectContext.reset();
    const knex = testDb.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-auto-pruning', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  afterEach(() => {
    testCount++;
  });

  it('should link decisions to pruned files for WHY reasoning', async () => {
    // 1. Setup: Create task with pruned file
    const taskId = await createTestTask(testDb, 'Implement OAuth authentication');
    const prunedFileId = await createPrunedFileRecord(testDb, taskId, 'src/auth/oauth-handler.ts');

    // 2. Create decision explaining why file wasn't created
    const decisionResult = await setDecision({
      key: 'oauth-not-implemented',
      value: 'Decided to use API key auth instead of OAuth for simplicity',
      tags: ['architecture', 'authentication'],
      status: 'active'
    }, testDb);

    assert.ok(decisionResult.success, 'Decision creation should succeed');
    assert.strictEqual(decisionResult.key, 'oauth-not-implemented');

    // 3. Link decision to pruned file
    const linkResult = await linkPrunedFile({
      pruned_file_id: prunedFileId,
      decision_key: 'oauth-not-implemented'
    }, testDb);

    assert.ok(linkResult.success, 'Decision linking should succeed');
    assert.strictEqual(linkResult.pruned_file_id, prunedFileId);
    assert.strictEqual(linkResult.decision_key, 'oauth-not-implemented');
    assert.strictEqual(linkResult.task_id, taskId);
    assert.strictEqual(linkResult.file_path, 'src/auth/oauth-handler.ts');

    // 4. Verify link in database directly
    const knex = testDb.getKnex();
    const linkedDecisionId = await knex('v4_task_pruned_files')
      .where({ id: prunedFileId })
      .select('linked_decision_id')
      .first();

    assert.ok(linkedDecisionId, 'Pruned file record should exist');
    assert.ok(linkedDecisionId.linked_decision_id !== null, 'Decision key ID should be linked');

    // 5. Query pruned files - decision key should be returned
    const getPrunedResult = await getPrunedFiles({
      task_id: taskId,
      limit: 100
    }, testDb);

    assert.ok(getPrunedResult.success, 'get_pruned_files should succeed');
    assert.strictEqual(getPrunedResult.task_id, taskId);
    assert.strictEqual(getPrunedResult.count, 1, 'Should return 1 pruned file');
    assert.strictEqual(getPrunedResult.pruned_files.length, 1, 'pruned_files array should have 1 item');

    const prunedFile = getPrunedResult.pruned_files[0];
    assert.strictEqual(prunedFile.id, prunedFileId, 'Pruned file ID should match');
    assert.strictEqual(prunedFile.file_path, 'src/auth/oauth-handler.ts', 'File path should match');
    assert.ok(prunedFile.pruned_at, 'Should have pruned_at timestamp');
    assert.ok(prunedFile.linked_decision, 'Should have linked_decision key');
    assert.strictEqual(prunedFile.linked_decision, 'oauth-not-implemented', 'Linked decision key should match');
  });

  it('should handle multiple pruned files with different decisions', async () => {
    const taskId = await createTestTask(testDb, 'Feature implementation');

    // Create pruned files
    const prunedFileId1 = await createPrunedFileRecord(testDb, taskId, 'src/oauth-handler.ts');
    const prunedFileId2 = await createPrunedFileRecord(testDb, taskId, 'src/ldap-connector.ts');

    // Create decisions
    await setDecision({
      key: 'no-oauth',
      value: 'OAuth not needed for MVP',
      status: 'active'
    }, testDb);

    await setDecision({
      key: 'no-ldap',
      value: 'LDAP integration deferred to Phase 2',
      status: 'active'
    }, testDb);

    // Link decisions
    await linkPrunedFile({
      pruned_file_id: prunedFileId1,
      decision_key: 'no-oauth'
    }, testDb);

    await linkPrunedFile({
      pruned_file_id: prunedFileId2,
      decision_key: 'no-ldap'
    }, testDb);

    // Verify
    const getPrunedResult = await getPrunedFiles({
      task_id: taskId
    }, testDb);

    assert.strictEqual(getPrunedResult.count, 2, 'Should have 2 pruned files');

    const file1 = getPrunedResult.pruned_files.find((f: any) => f.file_path === 'src/oauth-handler.ts');
    const file2 = getPrunedResult.pruned_files.find((f: any) => f.file_path === 'src/ldap-connector.ts');

    assert.ok(file1, 'Should find oauth-handler.ts');
    assert.ok(file2, 'Should find ldap-connector.ts');
    assert.strictEqual(file1?.linked_decision, 'no-oauth');
    assert.strictEqual(file2?.linked_decision, 'no-ldap');
  });

  it('should handle pruned files without linked decisions', async () => {
    const taskId = await createTestTask(testDb, 'Task with unlinked pruned files');
    await createPrunedFileRecord(testDb, taskId, 'src/temp-file.ts');

    const getPrunedResult = await getPrunedFiles({
      task_id: taskId
    }, testDb);

    assert.ok(getPrunedResult.success);
    assert.strictEqual(getPrunedResult.count, 1);

    const prunedFile = getPrunedResult.pruned_files[0];
    assert.strictEqual(prunedFile.linked_decision, null, 'Unlinked file should have null decision');
  });

  it('should handle linking to non-existent decision gracefully', async () => {
    const taskId = await createTestTask(testDb, 'Task for error test');
    const prunedFileId = await createPrunedFileRecord(testDb, taskId, 'src/test.ts');

    // Attempt to link non-existent decision
    await assert.rejects(
      async () => {
        await linkPrunedFile({
          pruned_file_id: prunedFileId,
          decision_key: 'does-not-exist'
        }, testDb);
      },
      /Decision not found: does-not-exist/,
      'Should throw error for non-existent decision'
    );
  });

  it('should handle linking to non-existent pruned file gracefully', async () => {
    // Create decision
    await setDecision({
      key: 'test-decision',
      value: 'Test decision value',
      status: 'active'
    }, testDb);

    // Attempt to link non-existent pruned file
    await assert.rejects(
      async () => {
        await linkPrunedFile({
          pruned_file_id: 99999,
          decision_key: 'test-decision'
        }, testDb);
      },
      /Pruned file record not found: 99999/,
      'Should throw error for non-existent pruned file'
    );
  });

  it('should validate required parameters for linkPrunedFile', async () => {
    // Missing pruned_file_id
    await assert.rejects(
      async () => {
        await linkPrunedFile({
          pruned_file_id: 0,
          decision_key: 'test'
        }, testDb);
      },
      /pruned_file_id is required and must be a number/,
      'Should throw for invalid pruned_file_id'
    );

    // Missing decision_key
    await assert.rejects(
      async () => {
        await linkPrunedFile({
          pruned_file_id: 1,
          decision_key: ''
        }, testDb);
      },
      /decision_key is required and must be a string/,
      'Should throw for empty decision_key'
    );
  });

  it('should validate required parameters for getPrunedFiles', async () => {
    // Missing task_id
    await assert.rejects(
      async () => {
        await getPrunedFiles({
          task_id: 0
        }, testDb);
      },
      /task_id is required and must be a number/,
      'Should throw for invalid task_id'
    );

    // Non-existent task
    await assert.rejects(
      async () => {
        await getPrunedFiles({
          task_id: 99999
        }, testDb);
      },
      /Task not found: 99999/,
      'Should throw for non-existent task'
    );
  });

  it('should allow updating linked decision for a pruned file', async () => {
    const taskId = await createTestTask(testDb, 'Task for update test');
    const prunedFileId = await createPrunedFileRecord(testDb, taskId, 'src/feature.ts');

    // Create two decisions
    await setDecision({
      key: 'decision-v1',
      value: 'Initial decision',
      status: 'active'
    }, testDb);

    await setDecision({
      key: 'decision-v2',
      value: 'Updated decision',
      status: 'active'
    }, testDb);

    // Link first decision
    await linkPrunedFile({
      pruned_file_id: prunedFileId,
      decision_key: 'decision-v1'
    }, testDb);

    // Verify first link
    let getPrunedResult = await getPrunedFiles({ task_id: taskId }, testDb);
    assert.strictEqual(getPrunedResult.pruned_files[0].linked_decision, 'decision-v1');

    // Update to second decision
    await linkPrunedFile({
      pruned_file_id: prunedFileId,
      decision_key: 'decision-v2'
    }, testDb);

    // Verify updated link
    getPrunedResult = await getPrunedFiles({ task_id: taskId }, testDb);
    assert.strictEqual(getPrunedResult.pruned_files[0].linked_decision, 'decision-v2');
  });

  it('should respect limit parameter in getPrunedFiles', async () => {
    const taskId = await createTestTask(testDb, 'Task with many pruned files');

    // Create 5 pruned files
    for (let i = 1; i <= 5; i++) {
      await createPrunedFileRecord(testDb, taskId, `src/file${i}.ts`);
    }

    // Query with limit
    const getPrunedResult = await getPrunedFiles({
      task_id: taskId,
      limit: 3
    }, testDb);

    assert.ok(getPrunedResult.success);
    assert.strictEqual(getPrunedResult.count, 3, 'Should respect limit parameter');
    assert.strictEqual(getPrunedResult.pruned_files.length, 3);
  });

  console.log('\n✅ All decision linking to pruned files tests passed!\n');
});
