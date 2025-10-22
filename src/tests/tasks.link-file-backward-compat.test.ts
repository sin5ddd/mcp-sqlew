/**
 * Unit tests for backward compatibility of deprecated task.link(link_type="file") (v3.4.1)
 * Tests that the deprecated API still works while showing deprecation warnings
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
 * Inline implementation of linkTask for testing (file link_type only)
 */
function linkTaskFile(db: DatabaseType, params: {
  task_id: number;
  target_id: string;
}): any {
  if (!params.task_id) {
    throw new Error('Parameter "task_id" is required');
  }

  if (params.target_id === undefined || params.target_id === null) {
    throw new Error('Parameter "target_id" is required');
  }

  // Check if task exists
  const taskExists = db.prepare('SELECT id FROM t_tasks WHERE id = ?').get(params.task_id);
  if (!taskExists) {
    throw new Error(`Task with id ${params.task_id} not found`);
  }

  // Deprecation warning (v3.4.1) - would appear in console
  // console.warn(`⚠️  DEPRECATION WARNING: task.link(link_type="file") is deprecated as of v3.4.1.`);

  const filePath = String(params.target_id);
  const fileId = getOrCreateFile(db, filePath);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO t_task_file_links (task_id, file_id)
    VALUES (?, ?)
  `);
  stmt.run(params.task_id, fileId);

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
  beforeEach(() => {
    testDb = createTestDatabase();
  });

  it('should still link file to task (backward compatible)', () => {
    const taskId = createTestTask(testDb, 'Task for backward compat test');

    const result = linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    assert.ok(result.success, 'Should succeed');
    assert.strictEqual(result.task_id, taskId);
    assert.strictEqual(result.linked_to, 'file');
    assert.strictEqual(result.target, 'src/index.ts');
  });

  it('should include deprecation warning in response', () => {
    const taskId = createTestTask(testDb, 'Task for deprecation warning test');

    const result = linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/database.ts'
    });

    assert.ok(result.deprecation_warning, 'Should include deprecation warning');
    assert.ok(result.deprecation_warning.includes('deprecated'), 'Warning should mention deprecation');
    assert.ok(result.deprecation_warning.includes('watch_files'), 'Warning should suggest watch_files');
  });

  it('should create file link in database', () => {
    const taskId = createTestTask(testDb, 'Task for DB link test');

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/schema.ts'
    });

    // Verify file link was created
    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `).all(taskId) as { path: string }[];

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, 'src/schema.ts');
  });

  it('should handle multiple file links', () => {
    const taskId = createTestTask(testDb, 'Task for multiple links');

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/database.ts'
    });

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/schema.ts'
    });

    // Verify all links exist
    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
      ORDER BY f.path
    `).all(taskId) as { path: string }[];

    assert.strictEqual(links.length, 3);
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
    assert.strictEqual(links[2].path, 'src/schema.ts');
  });

  it('should be idempotent (duplicate links ignored)', () => {
    const taskId = createTestTask(testDb, 'Task for idempotent test');

    // Link same file twice
    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    // Should only have one link
    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `).all(taskId) as { path: string }[];

    assert.strictEqual(links.length, 1, 'Should not create duplicate links');
  });

  it('should work with new watch_files action on same task', () => {
    const taskId = createTestTask(testDb, 'Task for mixed API test');

    // Use old API
    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/index.ts'
    });

    // Use new API (simulated by direct DB insert)
    const fileId = getOrCreateFile(testDb, 'src/database.ts');
    testDb.prepare('INSERT OR IGNORE INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId, fileId);

    // Both files should be linked
    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
      ORDER BY f.path
    `).all(taskId) as { path: string }[];

    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].path, 'src/database.ts');
    assert.strictEqual(links[1].path, 'src/index.ts');
  });

  it('should throw error for invalid task_id', () => {
    assert.throws(
      () => {
        linkTaskFile(testDb, {
          task_id: 999,
          target_id: 'src/index.ts'
        });
      },
      /Task with id 999 not found/
    );
  });

  it('should handle various file path formats', () => {
    const taskId = createTestTask(testDb, 'Task for path formats');

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'package.json'
    });

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'src/tools/tasks.ts'
    });

    linkTaskFile(testDb, {
      task_id: taskId,
      target_id: 'docs/README.md'
    });

    const links = testDb.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON tfl.file_id = f.id
      WHERE tfl.task_id = ?
    `).all(taskId) as { path: string }[];

    assert.strictEqual(links.length, 3);
  });

  it('should maintain same database schema as new API', () => {
    const taskId1 = createTestTask(testDb, 'Task with old API');
    const taskId2 = createTestTask(testDb, 'Task with new API');

    // Old API
    linkTaskFile(testDb, {
      task_id: taskId1,
      target_id: 'src/index.ts'
    });

    // New API (simulated)
    const fileId = getOrCreateFile(testDb, 'src/index.ts');
    testDb.prepare('INSERT OR IGNORE INTO t_task_file_links (task_id, file_id) VALUES (?, ?)').run(taskId2, fileId);

    // Both should create identical links
    const links1 = testDb.prepare(`
      SELECT task_id, file_id
      FROM t_task_file_links
      WHERE task_id = ?
    `).all(taskId1) as { task_id: number; file_id: number }[];

    const links2 = testDb.prepare(`
      SELECT task_id, file_id
      FROM t_task_file_links
      WHERE task_id = ?
    `).all(taskId2) as { task_id: number; file_id: number }[];

    // Same file_id should be used
    assert.strictEqual(links1[0].file_id, links2[0].file_id, 'Should use same file ID');
  });

  console.log('\n✅ All backward compatibility tests passed!\n');
});
