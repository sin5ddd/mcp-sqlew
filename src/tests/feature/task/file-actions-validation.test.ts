/**
 * Unit tests for Task file_actions validation feature (v3.8.0)
 * Tests layer-based file_actions requirements and backward compatibility
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase } from '../database.js';
import { createTask } from '../tools/tasks/actions/create.js';
import { updateTask } from '../tools/tasks/actions/update.js';
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

describe('Task file_actions validation (v3.8.0)', () => {
  beforeEach(async () => {
    testDb = await createTestDatabase();
  });

  describe('Code layers - file_actions REQUIRED', () => {
    const codeLayers = ['presentation', 'business', 'data', 'infrastructure', 'cross-cutting'];

    for (const layer of codeLayers) {
      it(`should reject ${layer} layer task without file_actions`, async () => {
        await assert.rejects(
          async () => {
            await createTask(
              {
                title: `Test ${layer} task`,
                layer: layer as any,
                priority: 2
              },
              testDb
            );
          },
          (error: Error) => {
            assert.match(
              error.message,
              /file_actions.*required/i,
              `Expected error message to mention file_actions requirement for ${layer} layer`
            );
            return true;
          }
        );
      });

      it(`should accept ${layer} layer task with file_actions`, async () => {
        const result = await createTask(
          {
            title: `Test ${layer} task`,
            layer: layer as any,
            priority: 2,
            file_actions: [
              { action: 'create', path: `src/${layer}/module.ts` }
            ]
          },
          testDb
        );

        assert.ok(result.success, `Task creation should succeed for ${layer} layer with file_actions`);
        assert.ok(result.task_id, 'Task ID should be returned');
      });
    }
  });

  describe('Documentation layer - file_actions REQUIRED', () => {
    it('should reject documentation layer task without file_actions', async () => {
      await assert.rejects(
        async () => {
          await createTask(
            {
                  title: 'Update README',
              layer: 'documentation',
              priority: 2
            },
            testDb
          );
        },
        (error: Error) => {
          assert.match(
            error.message,
            /file_actions.*required/i,
            'Expected error message to mention file_actions requirement for documentation layer'
          );
          return true;
        }
      );
    });

    it('should accept documentation layer task with file_actions', async () => {
      const result = await createTask(
        {
          title: 'Update README',
          layer: 'documentation',
          priority: 2,
          file_actions: [
            { action: 'edit', path: 'README.md' },
            { action: 'create', path: 'docs/API.md' }
          ]
        },
        testDb
      );

      assert.ok(result.success, 'Task creation should succeed for documentation layer with file_actions');
      assert.ok(result.task_id, 'Task ID should be returned');
    });
  });

  describe('Planning layers - file_actions OPTIONAL', () => {
    const planningLayers = ['planning', 'coordination', 'review'];

    for (const layer of planningLayers) {
      it(`should accept ${layer} layer task without file_actions`, async () => {
        const result = await createTask(
          {
              title: `Test ${layer} task`,
            layer: layer as any,
            priority: 2
          },
          testDb
        );

        assert.ok(result.success, `Task creation should succeed for ${layer} layer without file_actions`);
        assert.ok(result.task_id, 'Task ID should be returned');
      });

      it(`should accept ${layer} layer task with file_actions`, async () => {
        const result = await createTask(
          {
              title: `Test ${layer} task`,
            layer: layer as any,
            priority: 2,
            file_actions: [
              { action: 'create', path: `docs/${layer}-notes.md` }
            ]
          },
          testDb
        );

        assert.ok(result.success, `Task creation should succeed for ${layer} layer with file_actions`);
        assert.ok(result.task_id, 'Task ID should be returned');
      });
    }
  });

  describe('Backward compatibility - watch_files conversion', () => {
    it('should auto-convert watch_files to file_actions for code layers', async () => {
      const result = await createTask(
        {
          title: 'Legacy task with watch_files',
          layer: 'business',
          priority: 2,
          watch_files: ['src/service/auth.ts', 'src/service/user.ts']
        },
        testDb
      );

      assert.ok(result.success, 'Task creation should succeed with watch_files auto-conversion');
      assert.ok(result.task_id, 'Task ID should be returned');
    });

    it('should auto-convert watch_files to file_actions for planning layers', async () => {
      const result = await createTask(
        {
          title: 'Planning task with watch_files',
          layer: 'planning',
          priority: 2,
          watch_files: ['docs/research.md']
        },
        testDb
      );

      assert.ok(result.success, 'Task creation should succeed with watch_files for planning layer');
      assert.ok(result.task_id, 'Task ID should be returned');
    });
  });

  describe('file_actions validation - valid actions', () => {
    it('should accept valid file actions (create, edit, delete)', async () => {
      const result = await createTask(
        {
          title: 'Task with various file actions',
          layer: 'business',
          priority: 2,
          file_actions: [
            { action: 'create', path: 'src/new-module.ts' },
            { action: 'edit', path: 'src/existing-module.ts' },
            { action: 'delete', path: 'src/old-module.ts' }
          ]
        },
        testDb
      );

      assert.ok(result.success, 'Task creation should succeed with valid file actions');
      assert.ok(result.task_id, 'Task ID should be returned');
    });

    it('should reject invalid file action', async () => {
      await assert.rejects(
        async () => {
          await createTask(
            {
                  title: 'Task with invalid file action',
              layer: 'business',
              priority: 2,
              file_actions: [
                { action: 'invalid' as any, path: 'src/module.ts' }
              ]
            },
            testDb
          );
        },
        (error: Error) => {
          assert.match(
            error.message,
            /invalid.*action/i,
            'Expected error message to mention invalid action'
          );
          return true;
        }
      );
    });
  });

  describe('Update task with file_actions', () => {
    it('should allow updating file_actions for existing task', async () => {
      // Create initial task
      const createResult = await createTask(
        {
          title: 'Initial task',
          layer: 'business',
          priority: 2,
          file_actions: [
            { action: 'create', path: 'src/module1.ts' }
          ]
        },
        testDb
      );

      assert.ok(createResult.task_id, 'Task should be created');

      // Update with new file_actions
      const updateResult = await updateTask(
        {
          task_id: createResult.task_id,
          file_actions: [
            { action: 'edit', path: 'src/module1.ts' },
            { action: 'create', path: 'src/module2.ts' }
          ]
        },
        testDb
      );

      assert.ok(updateResult.success, 'Task update should succeed');
    });

    it('should auto-convert watch_files in update action', async () => {
      // Create initial task
      const createResult = await createTask(
        {
          title: 'Initial task',
          layer: 'business',
          priority: 2,
          file_actions: [
            { action: 'create', path: 'src/module1.ts' }
          ]
        },
        testDb
      );

      assert.ok(createResult.task_id, 'Task should be created');

      // Update using legacy watch_files parameter
      const updateResult = await updateTask(
        {
          task_id: createResult.task_id,
          watch_files: ['src/module3.ts']
        },
        testDb
      );

      assert.ok(updateResult.success, 'Task update should succeed with watch_files auto-conversion');
    });
  });

  describe('Error messages clarity', () => {
    it('should provide helpful error message for missing file_actions on code layer', async () => {
      await assert.rejects(
        async () => {
          await createTask(
            {
                  title: 'Code task without file_actions',
              layer: 'presentation',
              priority: 2
            },
            testDb
          );
        },
        (error: Error) => {
          // Verify error message is descriptive
          assert.match(error.message, /file_actions/i, 'Error should mention file_actions');
          assert.match(error.message, /presentation|required/i, 'Error should mention layer or requirement');
          return true;
        }
      );
    });
  });
});
