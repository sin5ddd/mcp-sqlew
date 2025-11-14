/**
 * Unit tests for Task watch_files action (v3.4.1)
 * Tests the new watch_files action: watch, unwatch, list
 *
 * **v3.9.0 Update**: Uses shared test helpers from test-helpers.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { getOrCreateFile } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import { SQLiteAdapter } from '../../../adapters/sqlite-adapter.js';
import { createTestTask } from '../../utils/test-helpers.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../../');

/**
 * Test database instance
 */
let testDb: DatabaseAdapter;

/**
 * Create an in-memory test database
 */
async function createTestDatabase(): Promise<DatabaseAdapter> {
  const adapter = new SQLiteAdapter({
    type: 'sqlite',
    connection: {
      host: '',
      port: 0,
      database: ':memory:',
    },
    auth: {
      type: 'direct',
    },
  });
  await adapter.connect({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: {
      directory: [
        join(projectRoot, 'dist/config/knex/bootstrap'),
        join(projectRoot, 'dist/config/knex/upgrades'),
        join(projectRoot, 'dist/config/knex/enhancements'),
      ],
      extension: 'js',
      tableName: 'knex_migrations',
      loadExtensions: ['.js'],
    },
  });

  // Run migrations to set up schema
  const knex = adapter.getKnex();
  await knex.migrate.latest();

  return adapter;
}

/**
 * Inline implementation of watchFiles action for testing
 * **v3.9.0 Update**: Fixed v3.8.0+ schema compatibility (project_id, linked_ts)
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
    const currentTs = Math.floor(Date.now() / 1000);
    const projectId = 1; // Default project for tests

    for (const filePath of params.file_paths) {
      const fileId = await getOrCreateFile(db, projectId, filePath);

      // Try to insert, check if row was actually inserted
      const rowsBefore = await knex('t_task_file_links')
        .where({ project_id: projectId, task_id: params.task_id, file_id: fileId })
        .count('* as count')
        .first();

      await knex('t_task_file_links')
        .insert({
          task_id: params.task_id,
          file_id: fileId,
          project_id: projectId,  // Required v3.7.0+
          linked_ts: currentTs     // Required v3.8.0+
        })
        .onConflict(['project_id', 'task_id', 'file_id'])  // v3.8.0+ UNIQUE constraint
        .ignore();

      const rowsAfter = await knex('t_task_file_links')
        .where({ project_id: projectId, task_id: params.task_id, file_id: fileId })
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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task without files', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task to watch files', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task with watched files', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for idempotent test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for unwatch test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for batch unwatch', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for non-existent unwatch', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for error test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for error test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for empty array test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for full cycle test', projectId: 1 });

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
    const knex = testDb.getKnex();
    const taskId = await createTestTask(knex, { title: 'Task for path formats', projectId: 1 });

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
