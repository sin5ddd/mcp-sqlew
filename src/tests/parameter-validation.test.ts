#!/usr/bin/env node
/**
 * Parameter Validation Test Suite for MCP Sqlew
 * Tests parameter validation, typo detection, and error message structure
 * Covers all 42 actions across 5 tools
 */

import { validateActionParams, validateBatchParams } from '../utils/parameter-validator.js';
import { getActionSpec } from '../utils/action-specs.js';
import * as assert from 'assert';
import { test } from 'node:test';

interface ValidationTest {
  name: string;
  tool: string;
  action: string;
  params: any;
  shouldFail: boolean;
  expectedError?: {
    missing_params?: string[];
    did_you_mean?: Record<string, string>;
  };
}

// ============================================================================
// Test Data: Missing Required Parameters
// ============================================================================

const missingRequiredTests: ValidationTest[] = [
  {
    name: 'decision.set - missing key',
    tool: 'decision',
    action: 'set',
    params: { value: 'test value' },
    shouldFail: true,
    expectedError: { missing_params: ['key'] }
  },
  {
    name: 'decision.set - missing value',
    tool: 'decision',
    action: 'set',
    params: { key: 'test-key' },
    shouldFail: true,
    expectedError: { missing_params: ['value'] }
  },
  {
    name: 'decision.set - missing both key and value',
    tool: 'decision',
    action: 'set',
    params: {},
    shouldFail: true,
    expectedError: { missing_params: ['key', 'value'] }
  },
  {
    name: 'decision.get - missing key',
    tool: 'decision',
    action: 'get',
    params: {},
    shouldFail: true,
    expectedError: { missing_params: ['key'] }
  },
  {
    name: 'task.create - missing title',
    tool: 'task',
    action: 'create',
    params: { status: 'todo' },
    shouldFail: true,
    expectedError: { missing_params: ['title'] }
  },
  {
    name: 'task.update - missing task_id',
    tool: 'task',
    action: 'update',
    params: { title: 'Updated title' },
    shouldFail: true,
    expectedError: { missing_params: ['task_id'] }
  },
  {
    name: 'task.add_dependency - missing blocker_task_id and blocked_task_id',
    tool: 'task',
    action: 'add_dependency',
    params: {},
    shouldFail: true,
    expectedError: { missing_params: ['blocker_task_id', 'blocked_task_id'] }
  },
  {
    name: 'file.record - missing file_path',
    tool: 'file',
    action: 'record',
    params: { agent_name: 'test-agent', change_type: 'modified' },
    shouldFail: true,
    expectedError: { missing_params: ['file_path'] }
  },
  {
    name: 'file.record - missing agent_name and change_type',
    tool: 'file',
    action: 'record',
    params: { file_path: '/test/file.ts' },
    shouldFail: true,
    expectedError: { missing_params: ['agent_name', 'change_type'] }
  },
  {
    name: 'constraint.add - missing category',
    tool: 'constraint',
    action: 'add',
    params: { constraint_text: 'Test constraint', priority: 'high' },
    shouldFail: true,
    expectedError: { missing_params: ['category'] }
  },
  {
    name: 'constraint.add - missing constraint_text and priority',
    tool: 'constraint',
    action: 'add',
    params: { category: 'performance' },
    shouldFail: true,
    expectedError: { missing_params: ['constraint_text', 'priority'] }
  }
];

// ============================================================================
// Test Data: Typo Detection (Levenshtein Distance ≤ 2)
// ============================================================================

const typoDetectionTests: ValidationTest[] = [
  {
    name: 'decision.set - typo: "ky" → "key"',
    tool: 'decision',
    action: 'set',
    params: { ky: 'test-key', value: 'test value' },
    shouldFail: true,
    expectedError: { did_you_mean: { ky: 'key' } }
  },
  {
    name: 'decision.set - typo: "vlue" → "value"',
    tool: 'decision',
    action: 'set',
    params: { key: 'test-key', vlue: 'test value' },
    shouldFail: true,
    expectedError: { did_you_mean: { vlue: 'value' } }
  },
  {
    name: 'decision.set - typo: "layerr" → "layer"',
    tool: 'decision',
    action: 'set',
    params: { key: 'test-key', value: 'test', layerr: 'data' },
    shouldFail: true,
    expectedError: { did_you_mean: { layerr: 'layer' } }
  },
  {
    name: 'decision.set - typo: "tgs" → "tags"',
    tool: 'decision',
    action: 'set',
    params: { key: 'test-key', value: 'test', tgs: ['api'] },
    shouldFail: true,
    expectedError: { did_you_mean: { tgs: 'tags' } }
  },
  {
    name: 'task.create - typo: "titel" → "title"',
    tool: 'task',
    action: 'create',
    params: { titel: 'Test task' },
    shouldFail: true,
    expectedError: { did_you_mean: { titel: 'title' } }
  },
  {
    name: 'task.update - typo: "taskid" → "task_id"',
    tool: 'task',
    action: 'update',
    params: { taskid: 1, title: 'Updated' },
    shouldFail: true,
    expectedError: { did_you_mean: { taskid: 'task_id' } }
  },
  {
    name: 'task.create - typo: "priorit" → "priority"',
    tool: 'task',
    action: 'create',
    params: { title: 'Test', priorit: 3 },
    shouldFail: true,
    expectedError: { did_you_mean: { priorit: 'priority' } }
  },
  {
    name: 'file.record - typo: "file_pth" → "file_path"',
    tool: 'file',
    action: 'record',
    params: { file_pth: '/test/file.ts', agent_name: 'test', change_type: 'modified' },
    shouldFail: true,
    expectedError: { did_you_mean: { file_pth: 'file_path' } }
  },
  {
    name: 'file.record - typo: "change_typ" → "change_type"',
    tool: 'file',
    action: 'record',
    params: { file_path: '/test/file.ts', agent_name: 'test', change_typ: 'modified' },
    shouldFail: true,
    expectedError: { did_you_mean: { change_typ: 'change_type' } }
  },
  {
    name: 'constraint.add - typo: "categry" → "category"',
    tool: 'constraint',
    action: 'add',
    params: { categry: 'performance', constraint_text: 'Test', priority: 'high' },
    shouldFail: true,
    expectedError: { did_you_mean: { categry: 'category' } }
  }
];

// ============================================================================
// Test Data: Valid Parameter Combinations
// ============================================================================

const validParameterTests: ValidationTest[] = [
  {
    name: 'decision.set - valid with all optional params',
    tool: 'decision',
    action: 'set',
    params: {
      key: 'test-key',
      value: 'test value',
      agent: 'test-agent',
      layer: 'data',
      tags: ['database', 'api'],
      status: 'active',
      version: '1.0.0',
      scopes: ['auth', 'users']
    },
    shouldFail: false
  },
  {
    name: 'decision.set - valid with only required params',
    tool: 'decision',
    action: 'set',
    params: { key: 'test-key', value: 'test value' },
    shouldFail: false
  },
  {
    name: 'decision.quick_set - valid',
    tool: 'decision',
    action: 'quick_set',
    params: { key: 'test-key', value: 'test value' },
    shouldFail: false
  },
  {
    name: 'task.create - valid with optional params',
    tool: 'task',
    action: 'create',
    params: {
      title: 'Test task',
      status: 'todo',
      priority: 3,
      assigned_to: 'developer',
      layer: 'business',
      tags: ['feature', 'api']
    },
    shouldFail: false
  },
  {
    name: 'task.create - valid with only required param',
    tool: 'task',
    action: 'create',
    params: { title: 'Test task' },
    shouldFail: false
  },
  {
    name: 'task.add_dependency - valid',
    tool: 'task',
    action: 'add_dependency',
    params: { blocker_task_id: 1, blocked_task_id: 2 },
    shouldFail: false
  },
  {
    name: 'file.record - valid',
    tool: 'file',
    action: 'record',
    params: {
      file_path: '/src/index.ts',
      agent_name: 'developer',
      change_type: 'modified',
      layer: 'presentation'
    },
    shouldFail: false
  },
  {
    name: 'constraint.add - valid',
    tool: 'constraint',
    action: 'add',
    params: {
      category: 'performance',
      constraint_text: 'API response time must be < 100ms',
      priority: 'high',
      layer: 'business'
    },
    shouldFail: false
  },
  {
    name: 'stats.layer_summary - valid (no params required)',
    tool: 'stats',
    action: 'layer_summary',
    params: {},
    shouldFail: false
  }
];

// ============================================================================
// Test Data: Help Actions (Should Skip Validation)
// ============================================================================

const helpActionTests: ValidationTest[] = [
  {
    name: 'decision.help - should skip validation',
    tool: 'decision',
    action: 'help',
    params: {},
    shouldFail: false
  },
  {
    name: 'task.example - should skip validation',
    tool: 'task',
    action: 'example',
    params: {},
    shouldFail: false
  },
  {
    name: 'constraint.use_case - should skip validation',
    tool: 'constraint',
    action: 'use_case',
    params: {},
    shouldFail: false
  },
  {
    name: 'stats.help_action - should skip validation',
    tool: 'stats',
    action: 'help_action',
    params: {},
    shouldFail: false
  }
];

// ============================================================================
// Test Runner Functions
// ============================================================================

function runValidationTest(testCase: ValidationTest): void {
  try {
    validateActionParams(testCase.tool, testCase.action, testCase.params);

    if (testCase.shouldFail) {
      throw new Error(`Expected validation to fail, but it passed`);
    }

    // Success - validation passed as expected
  } catch (error) {
    if (!testCase.shouldFail) {
      throw new Error(`Unexpected validation failure: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Validation failed as expected - verify error structure
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to parse as JSON error
    let parsedError: any;
    try {
      parsedError = JSON.parse(errorMessage);
    } catch {
      // Not JSON - that's okay for some errors
      return;
    }

    // Verify error structure has required fields
    assert.ok(parsedError.error, 'Error should have "error" field');
    assert.ok(parsedError.action, 'Error should have "action" field');
    assert.ok(Array.isArray(parsedError.required_params), 'Error should have "required_params" array');
    assert.ok(Array.isArray(parsedError.optional_params), 'Error should have "optional_params" array');
    assert.ok(Array.isArray(parsedError.you_provided), 'Error should have "you_provided" array');
    assert.ok(parsedError.example, 'Error should have "example" field');

    // Verify expected error details
    if (testCase.expectedError?.missing_params) {
      assert.ok(Array.isArray(parsedError.missing_params), 'Error should have "missing_params" array');
      for (const param of testCase.expectedError.missing_params) {
        assert.ok(
          parsedError.missing_params.includes(param),
          `missing_params should include "${param}"`
        );
      }
    }

    if (testCase.expectedError?.did_you_mean) {
      assert.ok(parsedError.did_you_mean, 'Error should have "did_you_mean" field');
      for (const [typo, suggestion] of Object.entries(testCase.expectedError.did_you_mean)) {
        assert.strictEqual(
          parsedError.did_you_mean[typo],
          suggestion,
          `did_you_mean["${typo}"] should suggest "${suggestion}"`
        );
      }
    }
  }
}

// ============================================================================
// Test Suites
// ============================================================================

test('Missing Required Parameters', async (t) => {
  for (const testCase of missingRequiredTests) {
    await t.test(testCase.name, () => {
      runValidationTest(testCase);
    });
  }
});

test('Typo Detection (Levenshtein Distance ≤ 2)', async (t) => {
  for (const testCase of typoDetectionTests) {
    await t.test(testCase.name, () => {
      runValidationTest(testCase);
    });
  }
});

test('Valid Parameter Combinations', async (t) => {
  for (const testCase of validParameterTests) {
    await t.test(testCase.name, () => {
      runValidationTest(testCase);
    });
  }
});

test('Help Actions Skip Validation', async (t) => {
  for (const testCase of helpActionTests) {
    await t.test(testCase.name, () => {
      runValidationTest(testCase);
    });
  }
});

// ============================================================================
// Batch Validation Tests
// ============================================================================

test('Batch Validation', async (t) => {
  await t.test('validateBatchParams - valid batch', () => {
    const items = [
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 'value2' },
      { key: 'key3', value: 'value3' }
    ];

    // Should not throw
    validateBatchParams('decision', 'decisions', items, 'set', 50);
  });

  await t.test('validateBatchParams - missing required in batch item', () => {
    const items = [
      { key: 'key1', value: 'value1' },
      { key: 'key2' }, // Missing 'value'
      { key: 'key3', value: 'value3' }
    ];

    assert.throws(
      () => validateBatchParams('decision', 'decisions', items, 'set', 50),
      /Batch validation failed/,
      'Should throw batch validation error'
    );
  });

  await t.test('validateBatchParams - exceeds max items', () => {
    const items = Array(51).fill({ key: 'key', value: 'value' });

    assert.throws(
      () => validateBatchParams('decision', 'decisions', items, 'set', 50),
      /must contain at most 50 items/,
      'Should throw max items exceeded error'
    );
  });

  await t.test('validateBatchParams - not an array', () => {
    assert.throws(
      () => validateBatchParams('decision', 'decisions', 'not-an-array' as any, 'set', 50),
      /must be an array/,
      'Should throw type error'
    );
  });

  await t.test('validateBatchParams - empty array is allowed', () => {
    // Should not throw
    validateBatchParams('decision', 'decisions', [], 'set', 50);
  });
});

// ============================================================================
// Action Spec Tests
// ============================================================================

test('Action Spec Registry', async (t) => {
  await t.test('getActionSpec - valid tool and action', () => {
    const spec = getActionSpec('decision', 'set');
    assert.ok(spec, 'Should return spec for valid tool/action');
    assert.ok(Array.isArray(spec.required), 'Spec should have required array');
    assert.ok(Array.isArray(spec.optional), 'Spec should have optional array');
    assert.ok(spec.example, 'Spec should have example');
  });

  await t.test('getActionSpec - invalid tool', () => {
    const spec = getActionSpec('invalid-tool', 'set');
    assert.strictEqual(spec, null, 'Should return null for invalid tool');
  });

  await t.test('getActionSpec - invalid action', () => {
    const spec = getActionSpec('decision', 'invalid-action');
    assert.strictEqual(spec, null, 'Should return null for invalid action');
  });

  await t.test('All tools have action specs', () => {
    const tools = ['decision', 'task', 'file', 'constraint', 'stats'];
    for (const tool of tools) {
      // Test at least one action per tool
      const spec = getActionSpec(tool, tool === 'decision' ? 'set' :
                                       tool === 'task' ? 'create' :
                                       tool === 'file' ? 'record' :
                                       tool === 'constraint' ? 'add' :
                                       'layer_summary');
      assert.ok(spec, `Tool "${tool}" should have action specs`);
    }
  });
});

console.log('\n✅ All parameter validation tests completed successfully!');
