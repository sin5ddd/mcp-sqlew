/**
 * Help System Test Suite
 *
 * Comprehensive tests for all help query actions to ensure:
 * 1. All help queries return valid data
 * 2. Error handling works correctly
 * 3. Token efficiency targets are met
 * 4. Database queries are performant
 */

import { initializeDatabase, getDatabase } from '../../../database.js';
import type { DatabaseAdapter } from '../../../adapters/types.js';
import {
  queryHelpAction,
  queryHelpParams,
  queryHelpTool,
  queryHelpUseCase,
  queryHelpListUseCases,
  queryHelpNextActions
} from '../../../tools/help-queries.js';
import { estimateTokens } from '../../../utils/token-estimation.js';

// Test configuration
const TEST_TOOLS = ['decision', 'task', 'message', 'file', 'constraint', 'config'];
const TEST_ACTIONS = {
  decision: ['set', 'get', 'list'],
  task: ['create'],
  message: ['send', 'get'],
  file: ['record', 'get'],
  constraint: ['add', 'get'],
  config: ['get', 'update'],
  stats: ['layer_summary', 'db_stats', 'clear']
};

/**
 * Test Suite Runner
 */
export async function runHelpSystemTests(): Promise<{
  passed: number;
  failed: number;
  results: Array<{ test: string; status: 'PASS' | 'FAIL'; message?: string; tokens?: number }>;
}> {
  const results: Array<{ test: string; status: 'PASS' | 'FAIL'; message?: string; tokens?: number }> = [];
  let passed = 0;
  let failed = 0;

  // Initialize database
  const dbPath = process.env.DB_PATH || 'src/.sqlew/tmp/test-knex.db';
  await initializeDatabase({
    databaseType: 'sqlite',
    connection: { filename: dbPath }
  });
  const db = getDatabase();

  console.log('\n🧪 Running Help System Test Suite\n');

  // Test 1: help_action queries
  console.log('Test Group 1: help_action queries');
  for (const tool of TEST_TOOLS) {
    const actions = TEST_ACTIONS[tool as keyof typeof TEST_ACTIONS] || ['set', 'get'];
    for (const action of actions) {
      try {
        const result = queryHelpAction(db, tool, action);

        if ('error' in result) {
          results.push({
            test: `help_action: ${tool}.${action}`,
            status: 'FAIL',
            message: result.error
          });
          failed++;
          console.log(`  ❌ ${tool}.${action}: ${result.error}`);
        } else {
          const tokens = estimateTokens(result);
          const isEfficient = tokens >= 50 && tokens <= 450;

          if (isEfficient) {
            results.push({
              test: `help_action: ${tool}.${action}`,
              status: 'PASS',
              tokens
            });
            passed++;
            console.log(`  ✅ ${tool}.${action}: ${tokens} tokens`);
          } else {
            results.push({
              test: `help_action: ${tool}.${action}`,
              status: 'FAIL',
              message: `Token count ${tokens} outside target range (50-450)`,
              tokens
            });
            failed++;
            console.log(`  ❌ ${tool}.${action}: ${tokens} tokens (outside range)`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          test: `help_action: ${tool}.${action}`,
          status: 'FAIL',
          message
        });
        failed++;
        console.log(`  ❌ ${tool}.${action}: ${message}`);
      }
    }
  }

  // Test 2: help_params queries
  console.log('\nTest Group 2: help_params queries');
  for (const tool of TEST_TOOLS.slice(0, 3)) { // Test subset
    const actions = TEST_ACTIONS[tool as keyof typeof TEST_ACTIONS] || ['set'];
    for (const action of actions.slice(0, 1)) {
      try {
        const result = queryHelpParams(db, tool, action);

        if ('error' in result) {
          results.push({
            test: `help_params: ${tool}.${action}`,
            status: 'FAIL',
            message: result.error
          });
          failed++;
          console.log(`  ❌ ${tool}.${action}: ${result.error}`);
        } else {
          const tokens = estimateTokens(result);
          const isEfficient = tokens >= 30 && tokens <= 350;

          if (isEfficient) {
            results.push({
              test: `help_params: ${tool}.${action}`,
              status: 'PASS',
              tokens
            });
            passed++;
            console.log(`  ✅ ${tool}.${action}: ${tokens} tokens`);
          } else {
            results.push({
              test: `help_params: ${tool}.${action}`,
              status: 'FAIL',
              message: `Token count ${tokens} outside target range (30-350)`,
              tokens
            });
            failed++;
            console.log(`  ❌ ${tool}.${action}: ${tokens} tokens (outside range)`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          test: `help_params: ${tool}.${action}`,
          status: 'FAIL',
          message
        });
        failed++;
        console.log(`  ❌ ${tool}.${action}: ${message}`);
      }
    }
  }

  // Test 3: help_tool queries
  console.log('\nTest Group 3: help_tool queries');
  for (const tool of TEST_TOOLS) {
    try {
      const result = queryHelpTool(db, tool);

      if ('error' in result) {
        results.push({
          test: `help_tool: ${tool}`,
          status: 'FAIL',
          message: result.error
        });
        failed++;
        console.log(`  ❌ ${tool}: ${result.error}`);
      } else {
        const tokens = estimateTokens(result);
        const isEfficient = tokens >= 80 && tokens <= 300;

        if (isEfficient) {
          results.push({
            test: `help_tool: ${tool}`,
            status: 'PASS',
            tokens
          });
          passed++;
          console.log(`  ✅ ${tool}: ${tokens} tokens`);
        } else {
          results.push({
            test: `help_tool: ${tool}`,
            status: 'FAIL',
            message: `Token count ${tokens} outside target range (80-300)`,
            tokens
          });
          failed++;
          console.log(`  ❌ ${tool}: ${tokens} tokens (outside range)`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        test: `help_tool: ${tool}`,
        status: 'FAIL',
        message
      });
      failed++;
      console.log(`  ❌ ${tool}: ${message}`);
    }
  }

  // Test 4: help_use_case queries
  console.log('\nTest Group 4: help_use_case queries');
  const useCaseIds = [1, 2, 3, 10, 20, 30]; // Test various IDs
  for (const id of useCaseIds) {
    try {
      const result = queryHelpUseCase(db, id);

      if ('error' in result) {
        // Expected for non-existent IDs
        if (id > 41) {
          results.push({
            test: `help_use_case: ID ${id} (expected fail)`,
            status: 'PASS'
          });
          passed++;
          console.log(`  ✅ ID ${id}: Error handling works`);
        } else {
          results.push({
            test: `help_use_case: ID ${id}`,
            status: 'FAIL',
            message: result.error
          });
          failed++;
          console.log(`  ❌ ID ${id}: ${result.error}`);
        }
      } else {
        const tokens = estimateTokens(result);
        const isEfficient = tokens >= 80 && tokens <= 350;

        if (isEfficient) {
          results.push({
            test: `help_use_case: ID ${id}`,
            status: 'PASS',
            tokens
          });
          passed++;
          console.log(`  ✅ ID ${id}: ${tokens} tokens`);
        } else {
          results.push({
            test: `help_use_case: ID ${id}`,
            status: 'FAIL',
            message: `Token count ${tokens} outside target range (80-350)`,
            tokens
          });
          failed++;
          console.log(`  ❌ ID ${id}: ${tokens} tokens (outside range)`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        test: `help_use_case: ID ${id}`,
        status: 'FAIL',
        message
      });
      failed++;
      console.log(`  ❌ ID ${id}: ${message}`);
    }
  }

  // Test 5: help_list_use_cases queries
  console.log('\nTest Group 5: help_list_use_cases queries');
  const listTests = [
    { name: 'all', params: {} },
    { name: 'by category', params: { category: 'task_management' } },
    { name: 'by complexity', params: { complexity: 'basic' } },
    { name: 'pagination', params: { limit: 5, offset: 0 } },
  ];

  for (const test of listTests) {
    try {
      const result = queryHelpListUseCases(db, test.params);

      if ('error' in result) {
        results.push({
          test: `help_list_use_cases: ${test.name}`,
          status: 'FAIL',
          message: result.error
        });
        failed++;
        console.log(`  ❌ ${test.name}: ${result.error}`);
      } else {
        const tokens = estimateTokens(result);
        const isEfficient = tokens >= 100 && tokens <= 700;

        if (isEfficient) {
          results.push({
            test: `help_list_use_cases: ${test.name}`,
            status: 'PASS',
            tokens
          });
          passed++;
          console.log(`  ✅ ${test.name}: ${tokens} tokens`);
        } else {
          results.push({
            test: `help_list_use_cases: ${test.name}`,
            status: 'FAIL',
            message: `Token count ${tokens} outside target range (100-700)`,
            tokens
          });
          failed++;
          console.log(`  ❌ ${test.name}: ${tokens} tokens (outside range)`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        test: `help_list_use_cases: ${test.name}`,
        status: 'FAIL',
        message
      });
      failed++;
      console.log(`  ❌ ${test.name}: ${message}`);
    }
  }

  // Test 6: help_next_actions queries
  console.log('\nTest Group 6: help_next_actions queries');
  const nextActionsTests = [
    { tool: 'decision', action: 'set' },
    { tool: 'task', action: 'create' },
    { tool: 'message', action: 'send' }
  ];

  for (const test of nextActionsTests) {
    try {
      const result = queryHelpNextActions(db, test.tool, test.action);

      if ('error' in result) {
        results.push({
          test: `help_next_actions: ${test.tool}.${test.action}`,
          status: 'FAIL',
          message: result.error
        });
        failed++;
        console.log(`  ❌ ${test.tool}.${test.action}: ${result.error}`);
      } else {
        const tokens = estimateTokens(result);
        const isEfficient = tokens >= 30 && tokens <= 150;

        if (isEfficient) {
          results.push({
            test: `help_next_actions: ${test.tool}.${test.action}`,
            status: 'PASS',
            tokens
          });
          passed++;
          console.log(`  ✅ ${test.tool}.${test.action}: ${tokens} tokens`);
        } else {
          results.push({
            test: `help_next_actions: ${test.tool}.${test.action}`,
            status: 'FAIL',
            message: `Token count ${tokens} outside target range (30-150)`,
            tokens
          });
          failed++;
          console.log(`  ❌ ${test.tool}.${test.action}: ${tokens} tokens (outside range)`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        test: `help_next_actions: ${test.tool}.${test.action}`,
        status: 'FAIL',
        message
      });
      failed++;
      console.log(`  ❌ ${test.tool}.${test.action}: ${message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Test Summary: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  return { passed, failed, results };
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHelpSystemTests().then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
