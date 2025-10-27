#!/usr/bin/env node
/**
 * Comprehensive feature test for MCP Sqlew
 * Tests all tools and actions to detect crashes with proper TypeScript types
 */

import { initializeDatabase, closeDatabase } from '../database.js';
import * as fs from 'fs';
import * as path from 'path';

// Import all tool functions
import { setDecision, getDecision, searchByTags, getVersions, searchByLayer, addDecisionContextAction, listDecisionContextsAction } from '../tools/context.js';
import { sendMessage, getMessages, markRead } from '../tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock } from '../tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint } from '../tools/constraints.js';
import { getLayerSummary, clearOldData, getStats } from '../tools/utils.js';
import { getConfig, updateConfig } from '../tools/config.js';
import { createTask, updateTask, getTask, listTasks, moveTask, linkTask, archiveTask, batchCreateTasks, addDependency, removeDependency, getDependencies } from '../tools/tasks.js';

const TEST_DB_PATH = '.sqlew/tmp/test-all-features.db';

interface TestResult {
  tool: string;
  action: string;
  status: 'PASS' | 'FAIL' | 'CRASH';
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function recordResult(tool: string, action: string, status: 'PASS' | 'FAIL' | 'CRASH', error?: string, duration?: number) {
  results.push({ tool, action, status, error, duration });
  const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '💥';
  log(`${statusIcon} ${tool}.${action} - ${status}${error ? ': ' + error : ''}${duration ? ` (${duration}ms)` : ''}`);
}

async function testDecisionTool() {
  log('\n=== Testing Decision Tool ===');

  // Test set action
  try {
    const start = Date.now();
    await setDecision({
      key: 'test-decision-1',
      value: 'Test decision value',
      agent: 'test-agent',
      tags: ['test', 'feature-testing'],
      layer: 'business',
      version: '1.0.0',
      status: 'active'
    });
    recordResult('decision', 'set', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'set', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get action
  try {
    const start = Date.now();
    const result = await getDecision({ key: 'test-decision-1' });
    recordResult('decision', 'get', result.found ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test search_tags action
  try {
    const start = Date.now();
    const result = await searchByTags({ tags: ['test'], match_mode: 'AND' });
    recordResult('decision', 'search_tags', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'search_tags', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test search_layer action
  try {
    const start = Date.now();
    const result = await searchByLayer({ layer: 'business', status: 'active' });
    recordResult('decision', 'search_layer', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'search_layer', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test versions action
  try {
    const start = Date.now();
    const result = await getVersions({ key: 'test-decision-1' });
    recordResult('decision', 'versions', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'versions', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test add_decision_context action
  try {
    const start = Date.now();
    await addDecisionContextAction({
      key: 'test-decision-1',
      rationale: 'Test rationale',
      alternatives_considered: ['Option A', 'Option B'],
      tradeoffs: 'Test tradeoffs'
    });
    recordResult('decision', 'add_decision_context', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'add_decision_context', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test list_decision_contexts action
  try {
    const start = Date.now();
    const result = await listDecisionContextsAction({});
    recordResult('decision', 'list_decision_contexts', Array.isArray(result.contexts) ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('decision', 'list_decision_contexts', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testMessageTool() {
  log('\n=== Testing Message Tool ===');

  // Test send action
  try {
    const start = Date.now();
    await sendMessage({
      from_agent: 'agent-1',
      to_agent: 'agent-2',
      msg_type: 'info',
      message: 'Test message',
      priority: 'medium'
    });
    recordResult('message', 'send', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('message', 'send', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get action
  try {
    const start = Date.now();
    const result = await getMessages({ agent_name: 'agent-2' });
    recordResult('message', 'get', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('message', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test mark_read action
  try {
    const start = Date.now();
    const messages = await getMessages({ agent_name: 'agent-2' });
    if (messages.messages.length > 0) {
      await markRead({ message_ids: [messages.messages[0].id], agent_name: 'agent-2' });
      recordResult('message', 'mark_read', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('message', 'mark_read', 'FAIL', 'No messages to mark as read');
    }
  } catch (error) {
    recordResult('message', 'mark_read', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testFileTool() {
  log('\n=== Testing File Tool ===');

  // Test record action
  try {
    const start = Date.now();
    await recordFileChange({
      file_path: '/test/file.ts',
      agent_name: 'test-agent',
      change_type: 'modified',
      description: 'Test change',
      layer: 'business'
    });
    recordResult('file', 'record', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('file', 'record', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get action
  try {
    const start = Date.now();
    const result = await getFileChanges({ file_path: '/test/file.ts' });
    recordResult('file', 'get', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('file', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test check_lock action
  try {
    const start = Date.now();
    await checkFileLock({ file_path: '/test/file.ts' });
    recordResult('file', 'check_lock', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('file', 'check_lock', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testConstraintTool() {
  log('\n=== Testing Constraint Tool ===');

  let constraintId: number | undefined;

  // Test add action
  try {
    const start = Date.now();
    const result = await addConstraint({
      category: 'architecture',
      constraint_text: 'Test constraint rule',
      priority: 'medium',
      tags: ['test'],
      created_by: 'test-agent'
    });
    constraintId = result.constraint_id;
    recordResult('constraint', 'add', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('constraint', 'add', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get action
  try {
    const start = Date.now();
    const result = await getConstraints({ category: 'architecture' });
    recordResult('constraint', 'get', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('constraint', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test deactivate action
  try {
    const start = Date.now();
    if (constraintId) {
      await deactivateConstraint({ constraint_id: constraintId });
      recordResult('constraint', 'deactivate', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('constraint', 'deactivate', 'FAIL', 'No constraint ID available');
    }
  } catch (error) {
    recordResult('constraint', 'deactivate', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testStatsTool() {
  log('\n=== Testing Stats Tool ===');

  // Test layer_summary action
  try {
    const start = Date.now();
    await getLayerSummary();
    recordResult('stats', 'layer_summary', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('stats', 'layer_summary', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test db_stats action
  try {
    const start = Date.now();
    await getStats();
    recordResult('stats', 'db_stats', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('stats', 'db_stats', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test clear action
  try {
    const start = Date.now();
    await clearOldData({});
    recordResult('stats', 'clear', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('stats', 'clear', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testConfigTool() {
  log('\n=== Testing Config Tool ===');

  // Test get action
  try {
    const start = Date.now();
    await getConfig();
    recordResult('config', 'get', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('config', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test update action
  try {
    const start = Date.now();
    await updateConfig({
      messageRetentionHours: 72,
      fileHistoryRetentionDays: 14,
      ignoreWeekend: true
    });
    recordResult('config', 'update', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('config', 'update', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function testTaskTool() {
  log('\n=== Testing Task Tool ===');

  let taskId1: number | undefined;
  let taskId2: number | undefined;

  // Test create action
  try {
    const start = Date.now();
    const result = await createTask({
      title: 'Test Task 1',
      description: 'Test description',
      status: 'todo',
      priority: 2,
      tags: ['test'],
      created_by_agent: 'test-agent'
    });
    taskId1 = result.task_id;
    recordResult('task', 'create', 'PASS', undefined, Date.now() - start);
  } catch (error) {
    recordResult('task', 'create', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test batch_create action
  try {
    const start = Date.now();
    const results = await batchCreateTasks({
      tasks: [
        {
          title: 'Test Task 2',
          priority: 1
        },
        {
          title: 'Test Task 3',
          priority: 3
        }
      ]
    });
    taskId2 = results.results[0]?.task_id;
    recordResult('task', 'batch_create', results.success ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('task', 'batch_create', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get action
  try {
    const start = Date.now();
    if (taskId1) {
      const result = await getTask({ task_id: taskId1 });
      recordResult('task', 'get', result.found ? 'PASS' : 'FAIL', undefined, Date.now() - start);
    } else {
      recordResult('task', 'get', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'get', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test list action
  try {
    const start = Date.now();
    const result = await listTasks({});
    recordResult('task', 'list', result.count >= 0 ? 'PASS' : 'FAIL', undefined, Date.now() - start);
  } catch (error) {
    recordResult('task', 'list', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test update action
  try {
    const start = Date.now();
    if (taskId1) {
      await updateTask({
        task_id: taskId1,
        description: 'Updated description',
        priority: 3
      });
      recordResult('task', 'update', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'update', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'update', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test move action
  try {
    const start = Date.now();
    if (taskId1) {
      await moveTask({ task_id: taskId1, new_status: 'in_progress' });
      recordResult('task', 'move', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'move', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'move', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test link action
  try {
    const start = Date.now();
    if (taskId1) {
      await linkTask({ task_id: taskId1, link_type: 'decision', target_id: 'test-decision-1' });
      recordResult('task', 'link', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'link', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'link', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test add_dependency action
  try {
    const start = Date.now();
    if (taskId1 && taskId2) {
      await addDependency({ blocker_task_id: taskId1, blocked_task_id: taskId2 });
      recordResult('task', 'add_dependency', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'add_dependency', 'FAIL', 'Need two task IDs');
    }
  } catch (error) {
    recordResult('task', 'add_dependency', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test get_dependencies action
  try {
    const start = Date.now();
    if (taskId1) {
      await getDependencies({ task_id: taskId1 });
      recordResult('task', 'get_dependencies', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'get_dependencies', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'get_dependencies', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test remove_dependency action
  try {
    const start = Date.now();
    if (taskId1 && taskId2) {
      await removeDependency({ blocker_task_id: taskId1, blocked_task_id: taskId2 });
      recordResult('task', 'remove_dependency', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'remove_dependency', 'FAIL', 'Need two task IDs');
    }
  } catch (error) {
    recordResult('task', 'remove_dependency', 'CRASH', error instanceof Error ? error.message : String(error));
  }

  // Test archive action
  try {
    const start = Date.now();
    if (taskId1) {
      await archiveTask({ task_id: taskId1 });
      recordResult('task', 'archive', 'PASS', undefined, Date.now() - start);
    } else {
      recordResult('task', 'archive', 'FAIL', 'No task ID available');
    }
  } catch (error) {
    recordResult('task', 'archive', 'CRASH', error instanceof Error ? error.message : String(error));
  }
}

async function runAllTests() {
  log('Starting comprehensive MCP Sqlew feature test...\n');

  // Ensure test directory exists
  const testDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Remove old test database if exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Initialize test database
  try {
    await initializeDatabase({ databaseType: 'sqlite', connection: { filename: TEST_DB_PATH } });
    log('✅ Database initialized successfully\n');
  } catch (error) {
    log(`❌ Failed to initialize database: ${error}`);
    process.exit(1);
  }

  try {
    await testDecisionTool();
    await testMessageTool();
    await testFileTool();
    await testConstraintTool();
    await testStatsTool();
    await testConfigTool();
    await testTaskTool();
  } finally {
    await closeDatabase();
  }

  // Print summary
  log('\n\n=== TEST SUMMARY ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const crashed = results.filter(r => r.status === 'CRASH').length;

  log(`Total tests: ${results.length}`);
  log(`✅ Passed: ${passed}`);
  log(`❌ Failed: ${failed}`);
  log(`💥 Crashed: ${crashed}`);

  if (crashed > 0) {
    log('\n=== CRASHES DETECTED ===');
    results.filter(r => r.status === 'CRASH').forEach(r => {
      log(`💥 ${r.tool}.${r.action}: ${r.error}`);
    });
  }

  if (failed > 0) {
    log('\n=== FAILURES ===');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      log(`❌ ${r.tool}.${r.action}: ${r.error || 'Unknown failure'}`);
    });
  }

  // Export results as JSON
  const resultsPath = path.join(testDir, 'test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  log(`\n📝 Detailed results saved to ${resultsPath}`);

  process.exit(crashed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('💥 Fatal error during testing:', error);
  console.error(error.stack);
  process.exit(1);
});
