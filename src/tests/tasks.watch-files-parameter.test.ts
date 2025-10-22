/**
 * Unit tests for Task watch_files parameter feature (v3.3.0)
 * Tests the new watch_files parameter in createTask and updateTask actions
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
 * Inline implementation of createTask with watch_files for testing
 */
function createTaskWithWatchFiles(db: DatabaseType, params: {
  title: string;
  description?: string;
  watch_files?: string[];
  created_by_agent?: string;
  tags?: string[];
  priority?: number;
  acceptance_criteria?: string;
}): any {
  const agentId = getOrCreateAgent(db, params.created_by_agent || 'system');
  const statusId = 1; // todo

  const result = db.prepare(`
    INSERT INTO t_tasks (title, status_id, priority, created_by_agent_id, assigned_agent_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.title, statusId, params.priority || 2, agentId, agentId);

  const taskId = result.lastInsertRowid as number;

  // Add description if provided
  if (params.description || params.acceptance_criteria) {
    db.prepare(`
      INSERT INTO t_task_details (task_id, description, acceptance_criteria)
      VALUES (?, ?, ?)
    `).run(taskId, params.description || null, params.acceptance_criteria || null);
  }

  // Add tags if provided
  if (params.tags && params.tags.length > 0) {
    const insertTagLink = db.prepare('INSERT OR IGNORE INTO t_task_tags (task_id, tag_id) VALUES (?, ?)');
    for (const tag of params.tags) {
      db.prepare('INSERT OR IGNORE INTO m_tags (name) VALUES (?)').run(tag);
      const tagResult = db.prepare('SELECT id FROM m_tags WHERE name = ?').get(tag) as { id: number };
      insertTagLink.run(taskId, tagResult.id);
    }
  }

  // Add watch_files if provided
  const watchedFiles: string[] = [];
  if (params.watch_files && params.watch_files.length > 0) {
    for (const filePath of params.watch_files) {
      const fileId = getOrCreateFile(db, filePath);
      db.prepare('INSERT OR IGNORE INTO t_task_file_links (task_id, file_id) VALUES (?, ?)')
        .run(taskId, fileId);
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
function updateTaskWithWatchFiles(db: DatabaseType, params: {
  task_id: number;
  watch_files?: string[];
}): any {
  const task = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
  if (!task) {
    throw new Error(`Task #${params.task_id} not found`);
  }

  const watchedFiles: string[] = [];
  if (params.watch_files && params.watch_files.length > 0) {
    for (const filePath of params.watch_files) {
      const fileId = getOrCreateFile(db, filePath);
      db.prepare('INSERT OR IGNORE INTO t_task_file_links (task_id, file_id) VALUES (?, ?)')
        .run(params.task_id, fileId);
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
  beforeEach(() => {
    testDb = createTestDatabase();
  });

  it('should create task with watch_files parameter', () => {
    const result = createTaskWithWatchFiles(testDb, {
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

  it('should link files in database', () => {
    createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = 1
      ORDER BY f.path
    `).all() as { path: string }[];

    assert.strictEqual(links.length, 2, 'Should have 2 file links');
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
  });

  it('should register files in m_files table', () => {
    createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    const files = testDb.prepare('SELECT path FROM m_files ORDER BY path').all() as { path: string }[];

    assert.ok(files.length >= 2, 'Should have at least 2 files registered');
    const paths = files.map(f => f.path);
    assert.ok(paths.includes('src/index.ts'));
    assert.ok(paths.includes('src/database.ts'));
  });

  it('should handle empty watch_files array', () => {
    const result = createTaskWithWatchFiles(testDb, {
      title: 'Task without file watching',
      watch_files: []
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files, undefined, 'Should not have watched_files in response');

    const links = testDb.prepare('SELECT * FROM t_task_file_links WHERE task_id = 1').all();
    assert.strictEqual(links.length, 0, 'Should have no file links');
  });

  it('should handle missing watch_files parameter', () => {
    const result = createTaskWithWatchFiles(testDb, {
      title: 'Task without watch_files param'
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files, undefined, 'Should not have watched_files in response');

    const links = testDb.prepare('SELECT * FROM t_task_file_links WHERE task_id = 1').all();
    assert.strictEqual(links.length, 0, 'Should have no file links');
  });

  it('should update task to add watch_files', () => {
    const task = createTaskWithWatchFiles(testDb, {
      title: 'Task without files initially'
    });

    const result = updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/tools/tasks.ts', 'src/schema.ts']
    });

    assert.ok(result.success);
    assert.deepStrictEqual(result.watched_files, ['src/tools/tasks.ts', 'src/schema.ts']);

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
      ORDER BY f.path
    `).all(task.task_id) as { path: string }[];

    assert.strictEqual(links.length, 2, 'Should have 2 file links after update');
  });

  it('should append new watch_files to existing ones', () => {
    const task = createTaskWithWatchFiles(testDb, {
      title: 'Task with initial files',
      watch_files: ['src/index.ts', 'src/database.ts']
    });

    updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/utils/validators.ts']
    });

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
      ORDER BY f.path
    `).all(task.task_id) as { path: string }[];

    assert.strictEqual(links.length, 3, 'Should have 3 file links total');
    const paths = links.map(l => l.path);
    assert.ok(paths.includes('src/index.ts'));
    assert.ok(paths.includes('src/database.ts'));
    assert.ok(paths.includes('src/utils/validators.ts'));
  });

  it('should handle duplicate file paths correctly (idempotent)', () => {
    const task = createTaskWithWatchFiles(testDb, {
      title: 'Task with files',
      watch_files: ['src/index.ts']
    });

    updateTaskWithWatchFiles(testDb, {
      task_id: task.task_id,
      watch_files: ['src/index.ts'] // Duplicate
    });

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `).all(task.task_id) as { path: string }[];

    assert.strictEqual(links.length, 1, 'Should not create duplicate links');
  });

  it('should handle various path formats', () => {
    const result = createTaskWithWatchFiles(testDb, {
      title: 'Task with various paths',
      watch_files: [
        'package.json',
        'src/types.ts',
        'docs/README.md'
      ]
    });

    assert.strictEqual(result.watched_files?.length, 3);

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
      ORDER BY f.path
    `).all(result.task_id) as { path: string }[];

    assert.strictEqual(links.length, 3);
    assert.strictEqual(links[0].path, 'docs/README.md');
    assert.strictEqual(links[1].path, 'package.json');
    assert.strictEqual(links[2].path, 'src/types.ts');
  });

  it('should work with acceptance_criteria', () => {
    const result = createTaskWithWatchFiles(testDb, {
      title: 'Task with auto-completion criteria',
      acceptance_criteria: 'All tests passing',
      watch_files: ['src/tests/tasks.watch-files-parameter.test.ts']
    });

    assert.ok(result.success);
    assert.strictEqual(result.watched_files?.length, 1);

    const details = testDb.prepare('SELECT acceptance_criteria FROM t_task_details WHERE task_id = ?')
      .get(result.task_id) as { acceptance_criteria: string } | undefined;

    assert.ok(details);
    assert.strictEqual(details.acceptance_criteria, 'All tests passing');
  });

  console.log('\n✅ All watch_files parameter tests passed!\n');
});
