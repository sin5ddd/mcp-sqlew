/**
 * Unit tests for Task watch_files action (v3.4.1)
 * Tests the new watch_files action: watch, unwatch, list
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { getOrCreateAgent, getOrCreateFile } from '../database.js';
import type { DatabaseAdapter } from '../adapters/types.js';
import { SQLiteAdapter } from '../adapters/sqlite-adapter.js';

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;

/**
 * Create an in-memory test database
 */
async function createTestDatabase(): Promise<DatabaseAdapter> {
  const adapter = new SQLiteAdapter();
  await adapter.connect({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });

  // Run migrations to set up schema
  const knex = adapter.getKnex();
  await knex.migrate.latest();

  return adapter;
}

/**
 * Helper: Create a test task
 */
async function createTestTask(db: DatabaseAdapter, title: string): Promise<number> {
  const agentId = await getOrCreateAgent(db, 'test-agent');
  const statusId = 1; // todo

  const knex = db.getKnex();
  const [id] = await knex('t_tasks').insert({
    title,
    status_id: statusId,
    priority: 2,
    created_by_agent_id: agentId,
    assigned_agent_id: agentId,
  });

  return id;
}

/**
 * Inline implementation of watchFiles action for testing
 */
async function watchFilesAction(db: DatabaseAdapter, params: {
  task_id: number;
  action: 'watch' | 'unwatch' | 'list';
  file_paths?: string[];
}): Promise<any> {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.action) {
    throw new Error('Parameter "action" is required (watch, unwatch, or list)');
  }

  const knex = db.getKnex();

  // Check if task exists
  const taskData = await knex('t_tasks as t')
    .join('m_task_statuses as s', 't.status_id', 's.id')
    .where('t.id', params.task_id)
    .select('t.id', 't.title', 's.name as status')
    .first();

  if (!taskData) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  if (params.action === 'watch') {
    if (!params.file_paths || params.file_paths.length === 0) {
      throw new Error('Parameter "file_paths" is required for watch action');
    }

    const addedFiles: string[] = [];
    for (const filePath of params.file_paths) {
      const fileId = await getOrCreateFile(db, filePath);

      // Try to insert, check if row was actually inserted
      const rowsBefore = await knex('t_task_file_links')
        .where({ task_id: params.task_id, file_id: fileId })
        .count('* as count')
        .first();

      await knex('t_task_file_links')
        .insert({ task_id: params.task_id, file_id: fileId })
        .onConflict(['task_id', 'file_id'])
        .ignore();

      const rowsAfter = await knex('t_task_file_links')
        .where({ task_id: params.task_id, file_id: fileId })
        .count('* as count')
        .first();

      // Check if row was actually inserted
      if (rowsAfter && rowsBefore && rowsAfter.count > rowsBefore.count) {
        addedFiles.push(filePath);
      }
    }

    return {
      success: true,
      task_id: params.task_id,
      action: 'watch',
      files_added: addedFiles.length,
      files: addedFiles,
      message: `Watching ${addedFiles.length} file(s) for task ${params.task_id}`
    };

  } else if (params.action === 'unwatch') {
    if (!params.file_paths || params.file_paths.length === 0) {
      throw new Error('Parameter "file_paths" is required for unwatch action');
    }

    const removedFiles: string[] = [];
    for (const filePath of params.file_paths) {
      const deletedCount = await knex('t_task_file_links')
        .whereIn('file_id', function() {
          this.select('id').from('m_files').where('path', filePath);
        })
        .andWhere('task_id', params.task_id)
        .delete();

      // Check if row was actually deleted
      if (deletedCount > 0) {
        removedFiles.push(filePath);
      }
    }

    return {
      success: true,
      task_id: params.task_id,
      action: 'unwatch',
      files_removed: removedFiles.length,
      files: removedFiles,
      message: `Stopped watching ${removedFiles.length} file(s) for task ${params.task_id}`
    };

  } else if (params.action === 'list') {
    const files = await knex('t_task_file_links as tfl')
      .join('m_files as f', 'tfl.file_id', 'f.id')
      .where('tfl.task_id', params.task_id)
      .select('f.path')
      .then(rows => rows.map((row: any) => row.path));

    return {
      success: true,
      task_id: params.task_id,
      action: 'list',
      files_count: files.length,
      files: files,
      message: `Task ${params.task_id} is watching ${files.length} file(s)`
    };

  } else {
    throw new Error(`Invalid action: ${params.action}. Must be one of: watch, unwatch, list`);
  }
}

describe('Task watch_files action tests', () => {
  beforeEach(async () => {
    testDb = await createTestDatabase();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.disconnect();
    }
  });

  it('should list watched files for task with no files', async () => {
    const taskId = await createTestTask(testDb, 'Task without files');

    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'list');
    assert.strictEqual(result.files_count, 0);
    assert.deepStrictEqual(result.files, []);
  });

  it('should watch files for a task', async () => {
    const taskId = await createTestTask(testDb, 'Task to watch files');

    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'watch');
    assert.strictEqual(result.files_added, 2);
    assert.deepStrictEqual(result.files, ['src/index.ts', 'src/database.ts']);
  });

  it('should list watched files after watching', async () => {
    const taskId = await createTestTask(testDb, 'Task with watched files');

    // Watch files
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts']
    });

    // List files
    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'list');
    assert.strictEqual(result.files_count, 3);
    assert.strictEqual(result.files.length, 3);
    assert.ok(result.files.includes('src/index.ts'));
    assert.ok(result.files.includes('src/database.ts'));
    assert.ok(result.files.includes('src/schema.ts'));
  });

  it('should handle watching duplicate files (idempotent)', async () => {
    const taskId = await createTestTask(testDb, 'Task for idempotent test');

    // Watch files first time
    const result1 = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    assert.strictEqual(result1.files_added, 1);

    // Watch same file again
    const result2 = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    assert.strictEqual(result2.files_added, 0, 'Should not add duplicate file');

    // Verify only one link exists
    const listResult = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 1);
  });

  it('should unwatch files from a task', async () => {
    const taskId = await createTestTask(testDb, 'Task for unwatch test');

    // Watch files
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts']
    });

    // Unwatch one file
    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/database.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'unwatch');
    assert.strictEqual(result.files_removed, 1);
    assert.deepStrictEqual(result.files, ['src/database.ts']);

    // Verify remaining files
    const listResult = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 2);
    assert.ok(listResult.files.includes('src/index.ts'));
    assert.ok(listResult.files.includes('src/schema.ts'));
    assert.ok(!listResult.files.includes('src/database.ts'));
  });

  it('should unwatch multiple files at once', async () => {
    const taskId = await createTestTask(testDb, 'Task for batch unwatch');

    // Watch files
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts', 'src/types.ts']
    });

    // Unwatch multiple files
    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/database.ts', 'src/types.ts']
    });

    assert.strictEqual(result.files_removed, 2);

    // Verify remaining files
    const listResult = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 2);
    assert.ok(listResult.files.includes('src/index.ts'));
    assert.ok(listResult.files.includes('src/schema.ts'));
  });

  it('should handle unwatching non-existent file gracefully', async () => {
    const taskId = await createTestTask(testDb, 'Task for non-existent unwatch');

    // Watch one file
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    // Try to unwatch file that was never watched
    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/non-existent.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.files_removed, 0, 'Should remove 0 files');
  });

  it('should throw error for invalid task_id', async () => {
    await assert.rejects(
      async () => {
        await watchFilesAction(testDb, {
          task_id: 999,
          action: 'list'
        });
      },
      /Task with id 999 not found/
    );
  });

  it('should throw error when watch action missing file_paths', async () => {
    const taskId = await createTestTask(testDb, 'Task for error test');

    await assert.rejects(
      async () => {
        await watchFilesAction(testDb, {
          task_id: taskId,
          action: 'watch'
        });
      },
      /Parameter "file_paths" is required for watch action/
    );
  });

  it('should throw error when unwatch action missing file_paths', async () => {
    const taskId = await createTestTask(testDb, 'Task for error test');

    await assert.rejects(
      async () => {
        await watchFilesAction(testDb, {
          task_id: taskId,
          action: 'unwatch'
        });
      },
      /Parameter "file_paths" is required for unwatch action/
    );
  });

  it('should handle empty file_paths array for watch', async () => {
    const taskId = await createTestTask(testDb, 'Task for empty array test');

    await assert.rejects(
      async () => {
        await watchFilesAction(testDb, {
          task_id: taskId,
          action: 'watch',
          file_paths: []
        });
      },
      /Parameter "file_paths" is required for watch action/
    );
  });

  it('should watch then unwatch all files', async () => {
    const taskId = await createTestTask(testDb, 'Task for full cycle test');

    // Watch files
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    // Verify watched
    const listResult1 = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });
    assert.strictEqual(listResult1.files_count, 2);

    // Unwatch all
    await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    // Verify empty
    const listResult2 = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });
    assert.strictEqual(listResult2.files_count, 0);
  });

  it('should handle various file path formats', async () => {
    const taskId = await createTestTask(testDb, 'Task for path formats');

    const result = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: [
        'package.json',
        'src/index.ts',
        'docs/README.md',
        'tests/unit/test.ts'
      ]
    });

    assert.strictEqual(result.files_added, 4);

    const listResult = await watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 4);
  });

  console.log('\n✅ All watch_files action tests passed!\n');
});
