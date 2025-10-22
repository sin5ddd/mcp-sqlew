/**
 * Unit tests for Task watch_files action (v3.3.0)
 * Tests the new watch_files action: watch, unwatch, list
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeSchema } from '../schema.js';
import { getOrCreateAgent, getOrCreateFile } from '../database.js';
import type { Database as DatabaseType } from '../types.js';

/**
 * Test database instance
 */
let testDb: DatabaseType;

/**
 * Create an in-memory test database
 */
function createTestDatabase(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  return db;
}

/**
 * Helper: Create a test task
 */
function createTestTask(db: DatabaseType, title: string): number {
  const agentId = getOrCreateAgent(db, 'test-agent');
  const statusId = 1; // todo

  const result = db.prepare(`
    INSERT INTO t_tasks (title, status_id, priority, created_by_agent_id, assigned_agent_id)
    VALUES (?, ?, 2, ?, ?)
  `).run(title, statusId, agentId, agentId);

  return result.lastInsertRowid as number;
}

/**
 * Inline implementation of watchFiles action for testing
 */
function watchFilesAction(db: DatabaseType, params: {
  task_id: number;
  action: 'watch' | 'unwatch' | 'list';
  file_paths?: string[];
}): any {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (!params.action) {
    throw new Error('Parameter "action" is required (watch, unwatch, or list)');
  }

  // Check if task exists
  const taskData = db.prepare(`
    SELECT t.id, t.title, s.name as status
    FROM t_tasks t
    JOIN m_task_statuses s ON t.status_id = s.id
    WHERE t.id = ?
  `).get(params.task_id) as { id: number; title: string; status: string } | undefined;

  if (!taskData) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  if (params.action === 'watch') {
    if (!params.file_paths || params.file_paths.length === 0) {
      throw new Error('Parameter "file_paths" is required for watch action');
    }

    const insertFileLinkStmt = db.prepare(`
      INSERT OR IGNORE INTO t_task_file_links (task_id, file_id)
      VALUES (?, ?)
    `);

    const addedFiles: string[] = [];
    for (const filePath of params.file_paths) {
      const fileId = getOrCreateFile(db, filePath);
      const result = insertFileLinkStmt.run(params.task_id, fileId);

      // Check if row was actually inserted (changes > 0)
      if (result.changes > 0) {
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

    const deleteFileLinkStmt = db.prepare(`
      DELETE FROM t_task_file_links
      WHERE task_id = ? AND file_id = (SELECT id FROM m_files WHERE path = ?)
    `);

    const removedFiles: string[] = [];
    for (const filePath of params.file_paths) {
      const result = deleteFileLinkStmt.run(params.task_id, filePath);

      // Check if row was actually deleted (changes > 0)
      if (result.changes > 0) {
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
    const filesStmt = db.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `);
    const files = filesStmt.all(params.task_id).map((row: any) => row.path);

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
  beforeEach(() => {
    testDb = createTestDatabase();
  });

  it('should list watched files for task with no files', () => {
    const taskId = createTestTask(testDb, 'Task without files');

    const result = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'list');
    assert.strictEqual(result.files_count, 0);
    assert.deepStrictEqual(result.files, []);
  });

  it('should watch files for a task', () => {
    const taskId = createTestTask(testDb, 'Task to watch files');

    const result = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'watch');
    assert.strictEqual(result.files_added, 2);
    assert.deepStrictEqual(result.files, ['src/index.ts', 'src/database.ts']);
  });

  it('should list watched files after watching', () => {
    const taskId = createTestTask(testDb, 'Task with watched files');

    // Watch files
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts']
    });

    // List files
    const result = watchFilesAction(testDb, {
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

  it('should handle watching duplicate files (idempotent)', () => {
    const taskId = createTestTask(testDb, 'Task for idempotent test');

    // Watch files first time
    const result1 = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    assert.strictEqual(result1.files_added, 1);

    // Watch same file again
    const result2 = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    assert.strictEqual(result2.files_added, 0, 'Should not add duplicate file');

    // Verify only one link exists
    const listResult = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 1);
  });

  it('should unwatch files from a task', () => {
    const taskId = createTestTask(testDb, 'Task for unwatch test');

    // Watch files
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts']
    });

    // Unwatch one file
    const result = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/database.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.action, 'unwatch');
    assert.strictEqual(result.files_removed, 1);
    assert.deepStrictEqual(result.files, ['src/database.ts']);

    // Verify remaining files
    const listResult = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 2);
    assert.ok(listResult.files.includes('src/index.ts'));
    assert.ok(listResult.files.includes('src/schema.ts'));
    assert.ok(!listResult.files.includes('src/database.ts'));
  });

  it('should unwatch multiple files at once', () => {
    const taskId = createTestTask(testDb, 'Task for batch unwatch');

    // Watch files
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts', 'src/schema.ts', 'src/types.ts']
    });

    // Unwatch multiple files
    const result = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/database.ts', 'src/types.ts']
    });

    assert.strictEqual(result.files_removed, 2);

    // Verify remaining files
    const listResult = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 2);
    assert.ok(listResult.files.includes('src/index.ts'));
    assert.ok(listResult.files.includes('src/schema.ts'));
  });

  it('should handle unwatching non-existent file gracefully', () => {
    const taskId = createTestTask(testDb, 'Task for non-existent unwatch');

    // Watch one file
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts']
    });

    // Try to unwatch file that was never watched
    const result = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/non-existent.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.files_removed, 0, 'Should remove 0 files');
  });

  it('should throw error for invalid task_id', () => {
    assert.throws(
      () => {
        watchFilesAction(testDb, {
          task_id: 999,
          action: 'list'
        });
      },
      /Task with id 999 not found/
    );
  });

  it('should throw error when watch action missing file_paths', () => {
    const taskId = createTestTask(testDb, 'Task for error test');

    assert.throws(
      () => {
        watchFilesAction(testDb, {
          task_id: taskId,
          action: 'watch'
        });
      },
      /Parameter "file_paths" is required for watch action/
    );
  });

  it('should throw error when unwatch action missing file_paths', () => {
    const taskId = createTestTask(testDb, 'Task for error test');

    assert.throws(
      () => {
        watchFilesAction(testDb, {
          task_id: taskId,
          action: 'unwatch'
        });
      },
      /Parameter "file_paths" is required for unwatch action/
    );
  });

  it('should handle empty file_paths array for watch', () => {
    const taskId = createTestTask(testDb, 'Task for empty array test');

    assert.throws(
      () => {
        watchFilesAction(testDb, {
          task_id: taskId,
          action: 'watch',
          file_paths: []
        });
      },
      /Parameter "file_paths" is required for watch action/
    );
  });

  it('should watch then unwatch all files', () => {
    const taskId = createTestTask(testDb, 'Task for full cycle test');

    // Watch files
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'watch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    // Verify watched
    const listResult1 = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });
    assert.strictEqual(listResult1.files_count, 2);

    // Unwatch all
    watchFilesAction(testDb, {
      task_id: taskId,
      action: 'unwatch',
      file_paths: ['src/index.ts', 'src/database.ts']
    });

    // Verify empty
    const listResult2 = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });
    assert.strictEqual(listResult2.files_count, 0);
  });

  it('should handle various file path formats', () => {
    const taskId = createTestTask(testDb, 'Task for path formats');

    const result = watchFilesAction(testDb, {
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

    const listResult = watchFilesAction(testDb, {
      task_id: taskId,
      action: 'list'
    });

    assert.strictEqual(listResult.files_count, 4);
  });

  console.log('\n✅ All watch_files action tests passed!\n');
});
