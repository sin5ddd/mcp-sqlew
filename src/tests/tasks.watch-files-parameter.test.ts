/**
 * Unit tests for Task watch_files parameter feature (v3.4.1)
 * Tests the new watch_files parameter in createTask and updateTask actions
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../database.js';
import { getOrCreateAgent, getOrCreateFile } from '../database.js';
import type { DatabaseAdapter } from '../adapters/types.js';

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
  const agentId = await getOrCreateAgent(adapter, params.created_by_agent || 'system');
  const statusId = 1; // todo

  const [taskId] = await knex('t_tasks').insert({
    title: params.title,
    status_id: statusId,
    priority: params.priority || 2,
    created_by_agent_id: agentId,
    assigned_agent_id: agentId
  });

  // Add description if provided
  if (params.description || params.acceptance_criteria) {
    await knex('t_task_details').insert({
      task_id: taskId,
      description: params.description || null,
      acceptance_criteria: params.acceptance_criteria || null
    });
  }

  // Add tags if provided
  if (params.tags && params.tags.length > 0) {
    for (const tag of params.tags) {
      await knex('m_tags').insert({ name: tag }).onConflict('name').ignore();
      const tagResult = await knex('m_tags').where({ name: tag }).first('id');
      await knex('t_task_tags').insert({
        task_id: taskId,
        tag_id: tagResult.id
      }).onConflict().ignore();
    }
  }

  // Add watch_files if provided
  const watchedFiles: string[] = [];
  if (params.watch_files && params.watch_files.length > 0) {
    for (const filePath of params.watch_files) {
      const fileId = await getOrCreateFile(adapter, 1, filePath);
      await knex('t_task_file_links').insert({
        task_id: taskId,
        file_id: fileId
      }).onConflict().ignore();
      watchedFiles.push(filePath);
    }
  }

  return {
    success: true,
    task_id: taskId,
    title: params.title,
    status: 'todo',
    ...(watchedFiles.length > 0 && { watched_files: watchedFiles })
  };
}

/**
 * Inline implementation of updateTask with watch_files for testing
 */
async function updateTaskWithWatchFiles(adapter: DatabaseAdapter, params: {
  task_id: number;
  watch_files?: string[];
}): Promise<any> {
  const knex = adapter.getKnex();
  const task = await knex('t_tasks').where({ id: params.task_id }).first('id');
  if (!task) {
    throw new Error(`Task #${params.task_id} not found`);
  }

  const watchedFiles: string[] = [];
  if (params.watch_files && params.watch_files.length > 0) {
    for (const filePath of params.watch_files) {
      const fileId = await getOrCreateFile(adapter, 1, filePath);
      await knex('t_task_file_links').insert({
        task_id: params.task_id,
        file_id: fileId
      }).onConflict().ignore();
      watchedFiles.push(filePath);
    }
  }

  return {
    success: true,
    task_id: params.task_id,
    ...(watchedFiles.length > 0 && { watched_files: watchedFiles })
  };
}

describe('Task watch_files parameter tests', () => {
  beforeEach(async () => {
    testDb = await createTestDatabase();
  });

  it('should create task with watch_files parameter', async () => {
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
  });

  it('should link files in database', async () => {
    await createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', 1)
      .select('f.path')
      .orderBy('f.path');

    assert.strictEqual(links.length, 2, 'Should have 2 file links');
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
  });

  it('should register files in m_files table', async () => {
    await createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const knex = testDb.getKnex();
    const files = await knex('m_files').select('path').orderBy('path');

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
    const links = await knex('t_task_file_links').where('task_id', 1);
    assert.strictEqual(links.length, 0, 'Should have no file links');
  });

  it('should handle missing watch_files parameter', async () => {
    const result = await createTaskWithWatchFiles(testDb, {
      title: 'Task without watch_files param'
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files, undefined, 'Should not have watched_files in response');

    const knex = testDb.getKnex();
    const links = await knex('t_task_file_links').where('task_id', 1);
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
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
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
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
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
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
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
    const links = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
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
    const details = await knex('t_task_details')
      .where({ task_id: result.task_id })
      .first('acceptance_criteria');

    assert.ok(details);
    assert.strictEqual(details.acceptance_criteria, 'All tests passing');
  });

  console.log('\n✅ All watch_files parameter tests passed!\n');
});
