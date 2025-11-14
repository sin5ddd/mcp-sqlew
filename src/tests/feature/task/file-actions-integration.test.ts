/**
 * Integration tests for v3.8.0 MCP integration fixes
 *
 * Tests verify:
 * 1. MCP SDK accepts file_actions parameter (Issue #1 fix)
 * 2. watch_files array parsing works for all formats (Issue #2 fix)
 * 3. Backward compatibility maintained (Constraint #44)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseAdapter } from '../../../adapters/index.js';
import { createTask } from '../../../tools/tasks/actions/create.js';
import { parseArrayParam } from '../../../tools/tasks/internal/validation.js';
import { ProjectContext } from '../../../utils/project-context.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import type { TaskFileAction } from '../../../tools/tasks/types.js';
import knexConfig from '../../../knexfile.js';

let testDb: DatabaseAdapter;

async function createTestDatabase(): Promise<DatabaseAdapter> {
  // Use createDatabaseAdapter directly to bypass singleton pattern in initializeDatabase()
  const adapter = createDatabaseAdapter('sqlite');

  // Connect using test config with in-memory database
  const config = {
    ...knexConfig.development,
    connection: { filename: ':memory:' }
  };
  await adapter.connect(config);

  // Run migrations to create schema (same as initializeDatabase() does)
  const knex = adapter.getKnex();
  const migrationsConfig = config.migrations || {};
  await knex.migrate.latest(migrationsConfig);

  return adapter;
}

describe('File Actions Integration Tests (v3.8.0)', () => {
  beforeEach(async () => {
    testDb = await createTestDatabase();

    // Initialize ProjectContext (required for v3.7.0+ multi-project support)
    const knex = testDb.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-file-actions', 'config', {
      projectRootPath: process.cwd(),
    });
  });

  afterEach(async () => {
    // Close database connection to prevent test hangs
    if (testDb) {
      await testDb.disconnect();
    }

    // Reset ProjectContext for test isolation
    ProjectContext.reset();
  });

  describe('Issue #1: MCP SDK file_actions parameter acceptance', () => {
    it('should accept file_actions parameter via MCP API', async () => {
      const file_actions: TaskFileAction[] = [
        { action: 'create', path: 'src/test.ts' },
        { action: 'edit', path: 'README.md' }
      ];

      const result = await createTask(
        {
          title: 'Test file_actions parameter',
          layer: 'infrastructure',
          file_actions,
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
      assert.strictEqual(result.title, 'Test file_actions parameter');
      assert.ok(result.task_id > 0, 'Task ID should be positive');
    });

    it('should validate file_actions structure', async () => {
      const file_actions: TaskFileAction[] = [
        { action: 'create', path: 'src/new-feature.ts' }
      ];

      const result = await createTask(
        {
          title: 'Test validation',
          layer: 'business',
          file_actions,
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
      assert.ok(result.task_id > 0, 'Task ID should be positive');
    });
  });

  describe('Issue #2: watch_files array parsing', () => {
    it('should parse watch_files as JavaScript array', () => {
      const watchFiles = ['src/file1.ts', 'src/file2.ts'];
      const parsed = parseArrayParam(watchFiles, 'watch_files');

      assert.ok(Array.isArray(parsed));
      assert.deepStrictEqual(parsed, ['src/file1.ts', 'src/file2.ts']);
    });

    it('should parse watch_files as JSON string', () => {
      const watchFilesString = '["src/file1.ts", "src/file2.ts"]';
      const parsed = parseArrayParam(watchFilesString, 'watch_files');

      assert.ok(Array.isArray(parsed));
      assert.deepStrictEqual(parsed, ['src/file1.ts', 'src/file2.ts']);
    });

    it('should parse watch_files as character array (MCP SDK bug case)', () => {
      // Simulate MCP SDK bug where it sends array as individual characters
      const jsonStr = '["src/test.ts"]';
      const charArray = jsonStr.split('');
      const parsed = parseArrayParam(charArray, 'watch_files');

      assert.ok(Array.isArray(parsed));
      assert.deepStrictEqual(parsed, ['src/test.ts']);
    });

    it('should handle single file path as string', () => {
      const singleFile = 'src/single.ts';
      const parsed = parseArrayParam(singleFile, 'watch_files');

      assert.ok(Array.isArray(parsed));
      assert.deepStrictEqual(parsed, ['src/single.ts']);
    });
  });

  describe('Backward Compatibility (Constraint #44)', () => {
    it('should auto-convert watch_files to file_actions', async () => {
      const result = await createTask(
        {
          title: 'Test watch_files conversion',
          layer: 'data',
          watch_files: ['src/models/user.ts', 'src/models/post.ts'],
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
      assert.strictEqual(result.title, 'Test watch_files conversion');
    });

    it('should prefer file_actions over watch_files when both provided', async () => {
      const file_actions: TaskFileAction[] = [
        { action: 'create', path: 'src/new.ts' }
      ];

      const result = await createTask(
        {
          title: 'Test priority',
          layer: 'infrastructure',
          file_actions,
          watch_files: ['src/old.ts'], // Should be ignored
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
    });

    it('should allow empty file_actions for non-file tasks', async () => {
      const result = await createTask(
        {
          title: 'Research task with no files',
          layer: 'infrastructure',
          file_actions: [], // Explicit empty array
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
      assert.strictEqual(result.title, 'Research task with no files');
    });
  });

  describe('Layer-based Validation (Constraint #41)', () => {
    it('should require file_actions for code layers', async () => {
      await assert.rejects(
        async () => {
          await createTask(
            {
              title: 'Missing file_actions',
              layer: 'business', // file-required layer
              // file_actions missing - should fail
            },
            testDb
          );
        },
        (error: Error) => {
          return error.message.includes('file_actions');
        },
        'Should reject task without file_actions'
      );
    });

    it('should allow omitting file_actions for planning layers', async () => {
      const result = await createTask(
        {
          title: 'Planning task',
          layer: 'planning', // file-optional layer
          // file_actions omitted - should work
        },
        testDb
      );

      assert.ok(result, 'Task should be created');
      assert.ok(result.task_id > 0, 'Task ID should be positive');
      assert.strictEqual(result.title, 'Planning task');
    });
  });
});
