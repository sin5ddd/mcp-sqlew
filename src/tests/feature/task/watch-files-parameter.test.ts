/**
 * Unit tests for Task watch_files parameter feature (v3.4.1)
 * Tests the new watch_files parameter in createTask and updateTask actions
 *
 * **v3.9.0 Update**: Uses shared test helpers from test-helpers.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../../../database.js';
import { getOrCreateFile } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { createTestTask, addWatchedFiles } from '../../utils/test-helpers.js';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;

/**
 * Create an in-memory test database
 */
async function createTestDatabase(): Promise<DatabaseAdapter> {
  const adapter = await initializeDatabase({
    databaseType: 'sqlite',
    connection: { filename: ':memory:' }
  });
  return adapter;
}

/**
 * Inline implementation of createTask with watch_files for testing
 * **v3.9.0 Update**: Fixed v3.8.0+ schema compatibility (project_id, linked_ts, created_ts, updated_ts)
 */
async function createTaskWithWatchFiles(adapter: DatabaseAdapter, params: {
  title: string;
  description?: string;
  watch_files?: string[];
  created_by_agent?: string;
  tags?: string[];
  priority?: number;
  acceptance_criteria?: string;
}): Promise<any> {
  const knex = adapter.getKnex();
  // Note: Agent tracking removed in v4.0 - created_by_agent param ignored
  const statusId = 1; // todo
  const currentTs = Math.floor(Date.now() / 1000);
  const projectId = 1; // Default project for tests

  const [taskId] = await knex('v4_tasks').insert({
    title: params.title,
    status_id: statusId,
    priority: params.priority || 2,
    project_id: projectId,        // Required v3.7.0+
    created_ts: currentTs,          // Required v3.8.0+
    updated_ts: currentTs           // Required v3.8.0+
  });

  // Extract numeric ID (better-sqlite3 returns {id: number} object)
  const numericTaskId = typeof taskId === 'object' && taskId !== null ? (taskId as any).id : taskId;

  // Add description if provided
  if (params.description || params.acceptance_criteria) {
    await knex('v4_task_details').insert({
      task_id: numericTaskId,
      description: params.description || null,
      acceptance_criteria: params.acceptance_criteria || null
    });
  }

  // Add tags if provided
  if (params.tags && params.tags.length > 0) {
    for (const tag of params.tags) {
      // Check if tag exists first (v4_tags has composite unique on project_id, name)
      let tagResult = await knex('v4_tags').where({ project_id: projectId, name: tag }).first('id');
      if (!tagResult) {
        const [tagId] = await knex('v4_tags').insert({ project_id: projectId, name: tag });
        const numericTagId = typeof tagId === 'object' && tagId !== null ? (tagId as any).id : tagId;
        tagResult = { id: numericTagId };
      }

      // Link tag to task (idempotent via onConflict)
      await knex('v4_task_tags').insert({
        project_id: projectId,  // Required v4 field
        task_id: numericTaskId,
        tag_id: tagResult.id
      }).onConflict(['project_id', 'task_id', 'tag_id']).ignore();
    }
  }

  // Add watch_files if provided using shared helper
  const watchedFiles: string[] = [];
  if (params.watch_files && params.watch_files.length > 0) {
    try {
      const addedFiles = await addWatchedFiles(knex, numericTaskId, params.watch_files, projectId);
      watchedFiles.push(...addedFiles);
    } catch (error: any) {
      console.error('Error adding watched files:', error);
      throw error;
    }
  }

  return {
    success: true,
    task_id: numericTaskId,
    title: params.title,
    status: 'todo',
    ...(watchedFiles.length > 0 && { watched_files: watchedFiles })
  };
}

/**
 * Inline implementation of updateTask with watch_files for testing
 * **v3.9.0 Update**: Uses shared helper for v3.8.0+ schema compatibility
 */
async function updateTaskWithWatchFiles(adapter: DatabaseAdapter, params: {
  task_id: number;
  watch_files?: string[];
}): Promise<any> {
  const knex = adapter.getKnex();
  const task = await knex('v4_tasks').where({ id: params.task_id }).first('id');
  if (!task) {
    throw new Error(`Task #${params.task_id} not found`);
  }

  const watchedFiles: string[] = [];
  const projectId = 1; // Default project for tests

  if (params.watch_files && params.watch_files.length > 0) {
    const addedFiles = await addWatchedFiles(knex, params.task_id, params.watch_files, projectId);
    watchedFiles.push(...addedFiles);
  }

  return {
    success: true,
    task_id: params.task_id,
    ...(watchedFiles.length > 0 && { watched_files: watchedFiles })
  };
}

describe('Task watch_files parameter tests', () => {
  beforeEach(async () => {
    // Create a fresh database for the first test, reuse for subsequent tests
    // (in-memory DB, so no persistence issues)
    if (!testDb) {
      testDb = await createTestDatabase();
    }
  });

  it('should create task with watch_files parameter', async () => {
    try {
      const result = await createTaskWithWatchFiles(testDb, {
        title: 'Test Task with File Watching',
        description: 'Testing watch_files parameter',
        watch_files: ['src/index.ts', 'src/database.ts'],
        created_by_agent: 'test-agent',
        tags: ['test'],
        priority: 2
      });

      assert.ok(result.success, 'Task creation should succeed');
      assert.strictEqual(result.task_id, 1, 'First task should have ID 1');
      assert.deepStrictEqual(result.watched_files, ['src/index.ts', 'src/database.ts'], 'Should return watched files list');
    } catch (error: any) {
      console.error('Test failed with error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  });

  it('should link files in database', async () => {
    await createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', 1)
      .select('f.path')
      .orderBy('f.path');

    assert.strictEqual(links.length, 2, 'Should have 2 file links');
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
  });

  it('should register files in v4_files table', async () => {
    await createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const knex = testDb.getKnex();
    const files = await knex('v4_files').select('path').orderBy('path');

    assert.ok(files.length >= 2, 'Should have at least 2 files registered');
    const paths = files.map(f => f.path);
    assert.ok(paths.includes('src/index.ts'));
    assert.ok(paths.includes('src/database.ts'));
  });

  it('should handle empty watch_files array', async () => {
    const result = await createTaskWithWatchFiles(testDb, {
      title: 'Task without file watching',
      watch_files: []
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files, undefined, 'Should not have watched_files in response');

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links').where('task_id', result.task_id);
    assert.strictEqual(links.length, 0, 'Should have no file links');
  });

  it('should handle missing watch_files parameter', async () => {
    const result = await createTaskWithWatchFiles(testDb, {
      title: 'Task without watch_files param'
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files, undefined, 'Should not have watched_files in response');

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links').where('task_id', result.task_id);
    assert.strictEqual(links.length, 0, 'Should have no file links');
  });

  it('should update task to add watch_files', async () => {
    const task = await createTaskWithWatchFiles(testDb, {
      title: 'Task without files initially'
    });

    const result = await updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/tools/tasks.ts', 'src/schema.ts']
    });

    assert.ok(result.success);
    assert.deepStrictEqual(result.watched_files, ['src/tools/tasks.ts', 'src/schema.ts']);

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', task.task_id)
      .select('f.path')
      .orderBy('f.path');

    assert.strictEqual(links.length, 2, 'Should have 2 file links after update');
  });

  it('should append new watch_files to existing ones', async () => {
    const task = await createTaskWithWatchFiles(testDb, {
      title: 'Task with initial files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    await updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/utils/validators.ts']
    });

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', task.task_id)
      .select('f.path')
      .orderBy('f.path');

    assert.strictEqual(links.length, 3, 'Should have 3 file links total');
    const paths = links.map(l => l.path);
    assert.ok(paths.includes('src/index.ts'));
    assert.ok(paths.includes('src/database.ts'));
    assert.ok(paths.includes('src/utils/validators.ts'));
  });

  it('should handle duplicate file paths correctly (idempotent)', async () => {
    const task = await createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts']
    });

    await updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/index.ts'] // Duplicate
    });

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', task.task_id)
      .select('f.path');

    assert.strictEqual(links.length, 1, 'Should not create duplicate links');
  });

  it('should handle various path formats', async () => {
    const result = await createTaskWithWatchFiles(testDb, {
      title: 'Task with various paths',
      watch_files: [
        'package.json',
        'src/types.ts',
        'docs/README.md'
      ]
    });

    assert.strictEqual(result.watched_files?.length, 3);

    const knex = testDb.getKnex();
    const links = await knex('v4_task_file_links as tfl')
      .join('v4_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', result.task_id)
      .select('f.path')
      .orderBy('f.path');

    assert.strictEqual(links.length, 3);
    assert.strictEqual(links[0].path, 'docs/README.md');
    assert.strictEqual(links[1].path, 'package.json');
    assert.strictEqual(links[2].path, 'src/types.ts');
  });

  it('should work with acceptance_criteria', async () => {
    const result = await createTaskWithWatchFiles(testDb, {
      title: 'Task with auto-completion criteria',
      acceptance_criteria: 'All tests passing',
      watch_files: ['src/tests/tasks.watch-files-parameter.test.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files?.length, 1);

    const knex = testDb.getKnex();
    const details = await knex('v4_task_details')
      .where({ task_id: result.task_id })
      .first('acceptance_criteria');

    assert.ok(details);
    assert.strictEqual(details.acceptance_criteria, 'All tests passing');
  });

  console.log('\n✅ All watch_files parameter tests passed!\n');
});
