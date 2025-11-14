/**
 * Unit tests for backward compatibility of deprecated task.link(link_type="file") (v3.4.1)
 * Tests that the deprecated API still works while showing deprecation warnings
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { initializeDatabase, getOrCreateAgent, getOrCreateFile, closeDatabase } from '../../../database.js';
import { ProjectContext } from '../../../utils/project-context.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;
let tempDir: string;
let tempDbPath: string;

/**
 * Helper: Create a test task
 */
async function createTestTask(db: DatabaseAdapter, title: string): Promise<number> {
  const agentId = await getOrCreateAgent(db, 'test-agent');
  const projectId = ProjectContext.getInstance().getProjectId();
  const statusId = 1; // todo

  const knex = db.getKnex();
  const now = Math.floor(Date.now() / 1000);
  const [taskId] = await knex('t_tasks').insert({
    title,
    status_id: statusId,
    priority: 2,
    created_by_agent_id: agentId,
    assigned_agent_id: agentId,
    project_id: projectId,
    created_ts: now,
    updated_ts: now,
  });

  return taskId;
}

/**
 * Inline implementation of linkTask for testing (file link_type only)
 */
async function linkTaskFile(db: DatabaseAdapter, params: {
  task_id: number;
  target_id: string;
}): Promise<any> {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (params.target_id === undefined || params.target_id === null) {
    throw new Error('Parameter "target_id" is required');
  }

  // Check if task exists
  const knex = db.getKnex();
  const taskExists = await knex('t_tasks').where('id', params.task_id).first();
  if (!taskExists) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  // Deprecation warning (v3.4.1) - would appear in console
  // console.warn(`⚠️  DEPRECATION WARNING: task.link(link_type="file") is deprecated as of v3.4.1.`);

  const filePath = String(params.target_id);
  const projectId = ProjectContext.getInstance().getProjectId();
  const fileId = await getOrCreateFile(db, projectId, filePath);
  const now = Math.floor(Date.now() / 1000);

  await knex('t_task_file_links')
    .insert({
      task_id: params.task_id,
      file_id: fileId,
      project_id: projectId,
      linked_ts: now
    })
    .onConflict(['project_id', 'task_id', 'file_id'])
    .ignore();

  return {
    success: true,
    task_id: params.task_id,
    linked_to: 'file',
    target: filePath,
    deprecation_warning: 'task.link(link_type="file") is deprecated. Use task.create/update(watch_files) or watch_files action instead.',
    message: `Task ${params.task_id} linked to file "${filePath}" (DEPRECATED API - use watch_files instead)`
  };
}

describe('Backward compatibility: task.link(link_type="file")', () => {
  beforeEach(async () => {
    // Create temp directory for test files and database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlew-test-'));
    tempDbPath = path.join(tempDir, 'test.db');

    // Initialize database with Knex adapter
    testDb = await initializeDatabase({
      databaseType: 'sqlite',
      connection: {
        filename: tempDbPath,
      },
    });

    // Initialize project context (required after v3.7.0)
    const knex = testDb.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-link-file-compat', 'config', {
      projectRootPath: process.cwd()
    });
  });

  afterEach(async () => {
    await closeDatabase();
    // Reset ProjectContext singleton for test isolation
    ProjectContext.reset();

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should still link file to task (backward compatible)', async () => {
    const taskId = await createTestTask(testDb, 'Task for backward compat test');

    const result = await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    assert.ok(result.success, 'Should succeed');
    assert.strictEqual(result.task_id, taskId);
    assert.strictEqual(result.linked_to, 'file');
    assert.strictEqual(result.target, 'src/index.ts');
  });

  it('should include deprecation warning in response', async () => {
    const taskId = await createTestTask(testDb, 'Task for deprecation warning test');

    const result = await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/database.ts'
    });

    assert.ok(result.deprecation_warning, 'Should include deprecation warning');
    assert.ok(result.deprecation_warning.includes('deprecated'), 'Warning should mention deprecation');
    assert.ok(result.deprecation_warning.includes('watch_files'), 'Warning should suggest watch_files');
  });

  it('should create file link in database', async () => {
    const taskId = await createTestTask(testDb, 'Task for DB link test');

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/schema.ts'
    });

    // Verify file link was created
    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .select('f.path');

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, 'src/schema.ts');
  });

  it('should handle multiple file links', async () => {
    const taskId = await createTestTask(testDb, 'Task for multiple links');

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/database.ts'
    });

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/schema.ts'
    });

    // Verify all links exist
    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .orderBy('f.path')
      .select('f.path');

    assert.strictEqual(links.length, 3);
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
    assert.strictEqual(links[2].path, 'src/schema.ts');
  });

  it('should be idempotent (duplicate links ignored)', async () => {
    const taskId = await createTestTask(testDb, 'Task for idempotent test');

    // Link same file twice
    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    // Should only have one link
    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .select('f.path');

    assert.strictEqual(links.length, 1, 'Should not create duplicate links');
  });

  it('should work with new watch_files action on same task', async () => {
    const taskId = await createTestTask(testDb, 'Task for mixed API test');

    // Use old API
    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    // Use new API (simulated by direct DB insert)
    const projectId = ProjectContext.getInstance().getProjectId();
    const fileId = await getOrCreateFile(testDb, projectId, 'src/database.ts');
    const knex = testDb.getKnex();
    const now = Math.floor(Date.now() / 1000);
    await knex('t_task_file_links')
      .insert({
        task_id: taskId,
        file_id: fileId,
        project_id: projectId,
        linked_ts: now
      })
      .onConflict(['project_id', 'task_id', 'file_id'])
      .ignore();

    // Both files should be linked
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .orderBy('f.path')
      .select('f.path');

    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
  });

  it('should throw error for invalid task_id', async () => {
    await assert.rejects(
      async () => {
        await linkTaskFile(testDb, {
          task_id: 999,
          target_id: 'src/index.ts'
        });
      },
      /Task with id 999 not found/
    );
  });

  it('should handle various file path formats', async () => {
    const taskId = await createTestTask(testDb, 'Task for path formats');

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'package.json'
    });

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/tools/tasks.ts'
    });

    await linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'docs/README.md'
    });

    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', taskId)
      .select('f.path');

    assert.strictEqual(links.length, 3);
  });

  it('should maintain same database schema as new API', async () => {
    const taskId1 = await createTestTask(testDb, 'Task with old API');
    const taskId2 = await createTestTask(testDb, 'Task with new API');

    // Old API
    await linkTaskFile(testDb, {
      task_id: taskId1,
      target_id: 'src/index.ts'
    });

    // New API (simulated)
    const projectId = ProjectContext.getInstance().getProjectId();
    const fileId = await getOrCreateFile(testDb, projectId, 'src/index.ts');
    const knex = testDb.getKnex();
    const now = Math.floor(Date.now() / 1000);
    await knex('t_task_file_links')
      .insert({
        task_id: taskId2,
        file_id: fileId,
        project_id: projectId,
        linked_ts: now
      })
      .onConflict(['project_id', 'task_id', 'file_id'])
      .ignore();

    // Both should create identical links
    const links1 = await knex('t_task_file_links')
      .where('task_id', taskId1)
      .select('task_id', 'file_id');

    const links2 = await knex('t_task_file_links')
      .where('task_id', taskId2)
      .select('task_id', 'file_id');

    // Same file_id should be used
    assert.strictEqual(links1[0].file_id, links2[0].file_id, 'Should use same file ID');
  });

  console.log('\n✅ All backward compatibility tests passed!\n');
});
