/**
 * Integration Tests for Batch Validation in Task Operations
 * Tests that batch validation prevents database errors by catching issues before transaction
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { batchCreateTasks } from '../tools/tasks/index.js';
import { DatabaseAdapter } from '../adapters/index.js';
import { initializeDatabase, closeDatabase } from '../database.js';
import { ProjectContext } from '../utils/project-context.js';
import { unlink } from 'node:fs/promises';

const TEST_DB_PATH = '.tmp-test/batch-validation-integration.db';

describe('Batch Validation Integration - Task Batch Create', () => {
  let adapter: DatabaseAdapter;

  before(async () => {
    // Initialize test database
    adapter = await initializeDatabase({
      databaseType: 'sqlite',
      connection: {
        filename: TEST_DB_PATH,
      },
    });

    // Initialize project context
    const knex = adapter.getKnex();
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, 'test-project', 'config');
  });

  after(async () => {
    // Cleanup
    await closeDatabase();
    try {
      await unlink(TEST_DB_PATH);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should reject batch with missing required field (title)', async () => {
    const tasks = [
      { title: 'Valid Task 1', layer: 'business', file_actions: [] },
      { layer: 'business', file_actions: [] } as any, // Missing title
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        assert.ok(error.message.includes('Batch validation failed'));
        assert.ok(error.message.includes('title'));
        assert.ok(error.message.includes('required') || error.message.includes('missing'));
        assert.ok(error.message.includes('Item 1'));
        return true;
      }
    );
  });

  it('should reject batch with invalid layer', async () => {
    const tasks = [
      { title: 'Task with typo', layer: 'busines', file_actions: [] }, // Typo in layer
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        assert.ok(error.message.includes('Batch validation failed'));
        assert.ok(error.message.includes('layer'));
        assert.ok(error.message.includes('busines'));
        assert.ok(error.message.includes('business') || error.message.includes('closest match'));
        return true;
      }
    );
  });

  it('should reject batch with missing file_actions for FILE_REQUIRED layer', async () => {
    const tasks = [
      { title: 'Missing file_actions', layer: 'business' }, // Missing file_actions for business layer
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        assert.ok(error.message.includes('Batch validation failed'));
        assert.ok(error.message.includes('file_actions'));
        assert.ok(error.message.includes('requires') || error.message.includes('required'));
        return true;
      }
    );
  });

  it('should reject batch with invalid priority range', async () => {
    const tasks = [
      { title: 'Invalid priority', layer: 'business', file_actions: [], priority: 10 }, // Priority out of range (1-5)
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        assert.ok(error.message.includes('Batch validation failed'));
        assert.ok(error.message.includes('priority'));
        assert.ok(error.message.includes('between 1 and 5'));
        return true;
      }
    );
  });

  it('should reject batch with invalid file_actions structure', async () => {
    const tasks = [
      {
        title: 'Invalid file_actions',
        layer: 'business',
        file_actions: [{ action: 'invalid-action', path: 'src/file.ts' }] // Invalid action
      },
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        assert.ok(error.message.includes('Batch validation failed'));
        assert.ok(error.message.includes('file_actions'));
        assert.ok(error.message.includes('invalid-action'));
        return true;
      }
    );
  });

  it('should report ALL validation errors at once (not just first error)', async () => {
    const tasks = [
      { title: 'Task 1', layer: 'busines', file_actions: [] }, // Invalid layer
      { layer: 'business', file_actions: [] } as any, // Missing title
      { title: 'Task 3', layer: 'business', priority: 10, file_actions: [] }, // Invalid priority
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        // Should report errors for all 3 items
        assert.ok(error.message.includes('Item 0')); // Task 1 - invalid layer
        assert.ok(error.message.includes('Item 1')); // Task 2 - missing title
        assert.ok(error.message.includes('Item 2')); // Task 3 - invalid priority
        assert.ok(error.message.includes('3 validation error'));
        return true;
      }
    );
  });

  it('should accept valid batch with FILE_REQUIRED layers and file_actions', async () => {
    const tasks = [
      {
        title: 'Valid Task 1',
        layer: 'business',
        file_actions: [{ action: 'create', path: 'src/model/user.ts' }],
        priority: 3
      },
      {
        title: 'Valid Task 2',
        layer: 'presentation',
        file_actions: [{ action: 'edit', path: 'src/components/UserForm.tsx' }],
        priority: 2
      },
    ];

    const result = await batchCreateTasks({ tasks }, adapter);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.created, 2);
    assert.strictEqual(result.failed, 0);
  });

  it('should accept valid batch with FILE_OPTIONAL layers without file_actions', async () => {
    const tasks = [
      {
        title: 'Research OAuth providers',
        layer: 'planning', // FILE_OPTIONAL layer
        priority: 3
        // No file_actions - this is valid for planning layer
      },
      {
        title: 'Review authentication implementation',
        layer: 'review', // FILE_OPTIONAL layer
        priority: 2
        // No file_actions - this is valid for review layer
      },
    ];

    const result = await batchCreateTasks({ tasks }, adapter);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.created, 2);
    assert.strictEqual(result.failed, 0);
  });

  it('should accept valid batch with empty file_actions array', async () => {
    const tasks = [
      {
        title: 'Plan authentication architecture',
        layer: 'business', // FILE_REQUIRED layer
        file_actions: [], // Empty array is valid for planning tasks
        priority: 3
      },
    ];

    const result = await batchCreateTasks({ tasks }, adapter);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.created, 1);
    assert.strictEqual(result.failed, 0);
  });

  it('should provide actionable fix instructions in error message', async () => {
    const tasks = [
      { title: 'Task with invalid layer', layer: 'infra' }, // Typo
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        // Should include fix instruction
        assert.ok(error.message.includes('💡 Fix:'));
        assert.ok(error.message.includes('infrastructure') || error.message.includes('Use one of'));
        return true;
      }
    );
  });

  it('should show valid options for enum fields in error message', async () => {
    const tasks = [
      { title: 'Task', layer: 'invalid-layer', file_actions: [] },
    ];

    await assert.rejects(
      async () => await batchCreateTasks({ tasks }, adapter),
      (error: Error) => {
        // Should list valid layer options
        assert.ok(error.message.includes('Valid:'));
        assert.ok(error.message.includes('presentation'));
        assert.ok(error.message.includes('business'));
        assert.ok(error.message.includes('data'));
        return true;
      }
    );
  });
});
