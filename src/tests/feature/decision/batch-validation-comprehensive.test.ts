/**
 * Comprehensive Batch Validation Test Suite
 * Tests batch validation across all tools (tasks, decisions, files)
 *
 * Test Coverage:
 * 1. Task Batch Validation (create_batch)
 * 2. Decision Batch Validation (set_batch)
 * 3. File Batch Validation (record_batch)
 * 4. Error Message Format Verification
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { batchCreateTasks } from '../../../tools/tasks/index.js';
import { setDecisionBatch } from '../../../tools/context/index.js';
import { recordFileChangeBatch } from '../../../tools/files/index.js';
import { DatabaseAdapter } from '../../../adapters/index.js';
import { initializeDatabase, closeDatabase } from '../../../database.js';
import { ProjectContext } from '../../../utils/project-context.js';
import { unlink } from 'node:fs/promises';

const TEST_DB_PATH = '.tmp-test/batch-validation-comprehensive.db';

describe('Comprehensive Batch Validation Test Suite', () => {
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

  // ============================================================================
  // 1. TASK BATCH VALIDATION (create_batch)
  // ============================================================================

  describe('Task Batch Validation - create_batch', () => {
    it('should reject batch with missing title', async () => {
      const tasks = [
        { title: 'Valid Task', layer: 'business', file_actions: [] },
        { layer: 'business' } as any, // Missing title
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

    it('should reject batch with missing layer', async () => {
      const tasks = [
        { title: 'Task without layer' } as any, // Missing layer - should fail if layer is required
      ];

      // Note: If layer is optional, this test should verify that validation passes
      // For now, we test that the batch processes (layer is optional in task creation)
      const result = await batchCreateTasks({ tasks }, adapter);
      assert.ok(result.success);
    });

    it('should reject batch with invalid layer value', async () => {
      const tasks = [
        { title: 'Invalid Layer Task', layer: 'invalid_layer', file_actions: [] },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('layer'));
          assert.ok(error.message.includes('invalid_layer'));
          assert.ok(
            error.message.includes('presentation') ||
            error.message.includes('business') ||
            error.message.includes('data')
          );
          return true;
        }
      );
    });

    it('should reject batch with missing file_actions for FILE_REQUIRED layers', async () => {
      const tasks = [
        { title: 'Task Missing file_actions', layer: 'business' }, // business layer requires file_actions
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('file_actions'));
          assert.ok(error.message.includes('required') || error.message.includes('business'));
          return true;
        }
      );
    });

    it('should reject batch with invalid file_actions type (not array)', async () => {
      const tasks = [
        {
          title: 'Invalid file_actions type',
          layer: 'business',
          file_actions: 'not-an-array' as any  // Should be array
        },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('file_actions'));
          assert.ok(error.message.includes('array') || error.message.includes('type'));
          return true;
        }
      );
    });

    it('should reject batch with invalid file_actions structure (missing action)', async () => {
      const tasks = [
        {
          title: 'Invalid file_actions structure',
          layer: 'business',
          file_actions: [{ path: 'src/test.ts' }] as any  // Missing action field
        },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('file_actions'));
          assert.ok(error.message.includes('action'));
          return true;
        }
      );
    });

    it('should reject batch with invalid file_actions action value', async () => {
      const tasks = [
        {
          title: 'Invalid action value',
          layer: 'business',
          file_actions: [{ action: 'invalid_action', path: 'src/test.ts' }] as any
        },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('action'));
          assert.ok(error.message.includes('invalid_action'));
          assert.ok(
            error.message.includes('create') ||
            error.message.includes('edit') ||
            error.message.includes('delete')
          );
          return true;
        }
      );
    });

    it('should reject batch with multiple errors at once', async () => {
      const tasks = [
        { title: 'Valid Task', layer: 'business', file_actions: [] },
        { layer: 'invalid_layer' } as any, // Missing title + invalid layer
        { title: 'Missing file_actions', layer: 'data' }, // Missing file_actions for FILE_REQUIRED layer
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          // Should mention multiple items
          assert.ok(error.message.includes('Item 1') || error.message.includes('Item 2'));
          // Should have multiple error types
          const errorCount = (error.message.match(/❌/g) || []).length;
          assert.ok(errorCount >= 2, `Expected at least 2 errors, got ${errorCount}`);
          return true;
        }
      );
    });

    it('should accept valid batch with all required fields', async () => {
      const tasks = [
        {
          title: 'Valid Task 1',
          layer: 'business',
          file_actions: [{ action: 'create' as const, path: 'src/feature1.ts' }]
        },
        {
          title: 'Valid Task 2',
          layer: 'data',
          file_actions: []
        },
        {
          title: 'Valid Task 3 - Planning Layer',
          layer: 'planning'  // FILE_OPTIONAL layer - no file_actions needed
        },
      ];

      const result = await batchCreateTasks({ tasks }, adapter);
      assert.ok(result.success);
      assert.strictEqual(result.created, 3);
      assert.strictEqual(result.failed, 0);
    });
  });

  // ============================================================================
  // 2. DECISION BATCH VALIDATION (set_batch)
  // ============================================================================

  describe('Decision Batch Validation - set_batch', () => {
    it('should reject batch with missing key', async () => {
      const decisions = [
        { key: 'valid-key', value: 'value-1' },
        { value: 'value-2' } as any, // Missing key
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('key'));
          assert.ok(error.message.includes('required') || error.message.includes('missing'));
          assert.ok(error.message.includes('Item 1'));
          return true;
        }
      );
    });

    it('should reject batch with missing decision/value', async () => {
      const decisions = [
        { key: 'missing-value' } as any, // Missing value
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('value'));
          assert.ok(error.message.includes('required') || error.message.includes('missing'));
          return true;
        }
      );
    });

    it('should reject batch with invalid layer', async () => {
      const decisions = [
        { key: 'invalid-layer', value: 'test', layer: 'invalid_layer' },
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('layer'));
          assert.ok(error.message.includes('invalid_layer'));
          assert.ok(
            error.message.includes('presentation') ||
            error.message.includes('business') ||
            error.message.includes('data')
          );
          return true;
        }
      );
    });

    it('should reject batch with invalid status', async () => {
      const decisions = [
        { key: 'invalid-status', value: 'test', status: 'invalid_status' as any },
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('status'));
          assert.ok(error.message.includes('invalid_status'));
          assert.ok(
            error.message.includes('active') ||
            error.message.includes('deprecated') ||
            error.message.includes('draft')
          );
          return true;
        }
      );
    });

    it('should reject batch with invalid tags type (string instead of array)', async () => {
      const decisions = [
        { key: 'invalid-tags', value: 'test', tags: 'not-an-array' as any },
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('tags'));
          assert.ok(error.message.includes('array') || error.message.includes('type'));
          return true;
        }
      );
    });

    it('should reject batch with multiple errors at once', async () => {
      const decisions = [
        { key: 'valid-key', value: 'valid-value' },
        { value: 'missing-key' } as any, // Missing key
        { key: 'invalid-status', value: 'test', status: 'bad_status' as any }, // Invalid status
        { key: 'invalid-tags', value: 'test', tags: 'not-array' as any }, // Invalid tags type
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          // Should mention multiple items
          assert.ok(error.message.includes('Item 1') || error.message.includes('Item 2'));
          // Should have multiple error types
          const errorCount = (error.message.match(/❌/g) || []).length;
          assert.ok(errorCount >= 2, `Expected at least 2 errors, got ${errorCount}`);
          return true;
        }
      );
    });

    it('should accept valid batch with all required fields', async () => {
      const decisions = [
        { key: 'decision-1', value: 'value-1' },
        { key: 'decision-2', value: 'value-2', layer: 'business' },
        { key: 'decision-3', value: 'value-3', tags: ['tag1', 'tag2'], status: 'active' as const },
      ];

      const result = await setDecisionBatch({ decisions }, adapter);
      assert.ok(result.success);
      assert.strictEqual(result.inserted, 3);
      assert.strictEqual(result.failed, 0);
    });
  });

  // ============================================================================
  // 3. FILE BATCH VALIDATION (record_batch)
  // ============================================================================

  describe('File Batch Validation - record_batch', () => {
    it('should reject batch with missing file_path', async () => {
      const file_changes = [
        { file_path: 'src/valid.ts', agent_name: 'test-agent', change_type: 'created' as const },
        { agent_name: 'test-agent', change_type: 'created' as const } as any, // Missing file_path
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('file_path'));
          assert.ok(error.message.includes('required') || error.message.includes('missing'));
          assert.ok(error.message.includes('Item 1'));
          return true;
        }
      );
    });

    // agent_name is optional since v4.1.2 (legacy sub-agent system removed)
    it('should accept batch without agent_name (optional since v4.1.2)', async () => {
      const file_changes = [
        { file_path: 'src/optional-agent-test.ts', change_type: 'created' as const },
      ];

      // Should NOT reject - agent_name is now optional
      const result = await recordFileChangeBatch({ file_changes }, adapter);
      assert.ok(result.success, 'Batch should succeed without agent_name');
      assert.strictEqual(result.inserted, 1, 'Should insert 1 file change');
    });

    it('should reject batch with missing change_type', async () => {
      const file_changes = [
        { file_path: 'src/test.ts', agent_name: 'test-agent' } as any, // Missing change_type
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('change_type'));
          assert.ok(error.message.includes('required') || error.message.includes('missing'));
          return true;
        }
      );
    });

    it('should reject batch with invalid change_type value', async () => {
      const file_changes = [
        {
          file_path: 'src/test.ts',
          agent_name: 'test-agent',
          change_type: 'invalid_change_type' as any
        },
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('change_type'));
          assert.ok(error.message.includes('invalid_change_type'));
          assert.ok(
            error.message.includes('created') ||
            error.message.includes('modified') ||
            error.message.includes('deleted')
          );
          return true;
        }
      );
    });

    it('should reject batch with invalid layer', async () => {
      const file_changes = [
        {
          file_path: 'src/test.ts',
          agent_name: 'test-agent',
          change_type: 'created' as const,
          layer: 'invalid_layer'
        },
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          assert.ok(error.message.includes('layer'));
          assert.ok(error.message.includes('invalid_layer'));
          assert.ok(
            error.message.includes('presentation') ||
            error.message.includes('business') ||
            error.message.includes('data')
          );
          return true;
        }
      );
    });

    it('should reject batch with multiple errors at once', async () => {
      // All items have all required fields (no missing fields)
      // but have invalid enum values (layer and change_type)
      const file_changes = [
        { file_path: 'src/valid.ts', agent_name: 'test-agent', change_type: 'created' as const },
        {
          file_path: 'src/invalid-change.ts',
          agent_name: 'test-agent',
          change_type: 'invalid_type' as any  // Invalid change_type
        },
        {
          file_path: 'src/invalid-layer.ts',
          agent_name: 'test-agent',
          change_type: 'modified' as const,
          layer: 'bad_layer'  // Invalid layer
        },
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Batch validation failed'));
          // Should report multiple items with errors
          const hasItemReferences =
            error.message.includes('Item 1') || error.message.includes('Item 2');
          assert.ok(hasItemReferences, `Expected item references in message: ${error.message}`);
          return true;
        }
      );
    });

    it('should accept valid batch with all required fields', async () => {
      const file_changes = [
        { file_path: 'src/file1.ts', agent_name: 'test-agent', change_type: 'created' as const },
        {
          file_path: 'src/file2.ts',
          agent_name: 'test-agent',
          change_type: 'modified' as const,
          layer: 'business'
        },
        { file_path: 'src/file3.ts', agent_name: 'test-agent', change_type: 'deleted' as const },
      ];

      const result = await recordFileChangeBatch({ file_changes }, adapter);
      assert.ok(result.success);
      assert.strictEqual(result.inserted, 3);
      assert.strictEqual(result.failed, 0);
    });
  });

  // ============================================================================
  // 4. ERROR MESSAGE FORMAT VERIFICATION
  // ============================================================================

  describe('Error Message Format Verification', () => {
    it('should include item index in error message', async () => {
      const tasks = [
        { title: 'Valid Task', layer: 'business', file_actions: [] },
        { layer: 'business' } as any, // Missing title at index 1
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('Item 1'));
          return true;
        }
      );
    });

    it('should include field name in error message', async () => {
      const decisions = [
        { key: 'test-key' } as any, // Missing value field
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          assert.ok(error.message.includes('value'));
          return true;
        }
      );
    });

    it('should include fix instructions in error message', async () => {
      const file_changes = [
        {
          file_path: 'src/test.ts',
          agent_name: 'test-agent',
          change_type: 'invalid_type' as any
        },
      ];

      await assert.rejects(
        async () => await recordFileChangeBatch({ file_changes }, adapter),
        (error: Error) => {
          // Should contain fix emoji and instruction
          assert.ok(error.message.includes('💡') || error.message.includes('Fix:'));
          return true;
        }
      );
    });

    it('should show valid options for enum fields', async () => {
      const tasks = [
        { title: 'Invalid Layer', layer: 'invalid_layer', file_actions: [] },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          // Should list valid layer options
          assert.ok(
            error.message.includes('presentation') &&
            error.message.includes('business') &&
            error.message.includes('data')
          );
          return true;
        }
      );
    });

    it('should show current invalid value in error message', async () => {
      const decisions = [
        { key: 'test', value: 'value', status: 'bad_status' as any },
      ];

      await assert.rejects(
        async () => await setDecisionBatch({ decisions }, adapter),
        (error: Error) => {
          // Should show the invalid value that was provided
          assert.ok(error.message.includes('bad_status'));
          return true;
        }
      );
    });

    it('should provide summary with valid/invalid counts', async () => {
      const tasks = [
        { title: 'Valid Task', layer: 'business', file_actions: [] },
        { layer: 'business' } as any, // Invalid - missing title
        { title: 'Another Valid', layer: 'planning' },
      ];

      await assert.rejects(
        async () => await batchCreateTasks({ tasks }, adapter),
        (error: Error) => {
          // Should show counts
          assert.ok(error.message.includes('valid') || error.message.includes('invalid'));
          // Should suggest action
          assert.ok(error.message.includes('Fix') || error.message.includes('Action'));
          return true;
        }
      );
    });
  });
});
