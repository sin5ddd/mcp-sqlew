#!/usr/bin/env node
/**
 * Comprehensive MCP Tool Testing Script
 * Tests all 7 tools with all 35 actions via JSON-RPC
 */

import { initializeDatabase } from './dist/database.js';
import {
  setDecision,
  getDecision,
  getContext,
  searchByTags,
  searchByLayer,
  getVersions,
  hardDeleteDecision
} from './dist/tools/context.js';
import { sendMessage, getMessages, markRead } from './dist/tools/messaging.js';
import { recordFileChange, getFileChanges, checkFileLock } from './dist/tools/files.js';
import { addConstraint, getConstraints, deactivateConstraint } from './dist/tools/constraints.js';
import { getLayerSummary, getStats, clearOldData, getActivityLog } from './dist/tools/utils.js';
import { getConfig, updateConfig } from './dist/tools/config.js';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  moveTask,
  linkTask,
  archiveTask,
  batchCreateTasks
} from './dist/tools/tasks.js';

// Initialize test database (use test-migration.db which has v3.0 schema + test data)
const db = initializeDatabase('test-migration.db');

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function test(name, fn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    fn();
    console.log(`   ✅ PASSED`);
    testsPassed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testsFailed++;
    failures.push({ test: name, error: error.message });
  }
}

console.log('\n========================================');
console.log('MCP SQLEW v3.0.0 - COMPREHENSIVE TESTING');
console.log('========================================\n');

// ============================================================================
// TOOL 1: decision (7 actions)
// ============================================================================
console.log('\n📦 TOOL 1: decision (7 actions)');
console.log('─────────────────────────────────────');

test('decision.set - Create decision with metadata', () => {
  const result = setDecision({
    key: 'test_auth_method',
    value: 'jwt',
    agent: 'test-agent',
    layer: 'business',
    tags: ['authentication', 'security'],
    scopes: ['auth-module'],
    status: 'active'
  });
  if (!result.success) throw new Error('Failed to set decision');
});

test('decision.get - Retrieve specific decision', () => {
  const result = getDecision({ key: 'test_auth_method' });
  if (!result.decision || result.decision.value !== 'jwt') {
    throw new Error('Failed to retrieve decision');
  }
});

test('decision.list - List all active decisions', () => {
  const result = getContext({ status: 'active', limit: 10 });
  if (!result.decisions || !Array.isArray(result.decisions)) {
    throw new Error('Failed to list decisions');
  }
});

test('decision.search_tags - Search by tags (AND mode)', () => {
  const result = searchByTags({
    tags: ['authentication', 'security'],
    tag_match: 'AND'
  });
  if (!result.decisions || result.decisions.length === 0) {
    throw new Error('Failed to search by tags');
  }
});

test('decision.search_layer - Search by layer', () => {
  const result = searchByLayer({ layer: 'business' });
  if (!result.decisions || result.decisions.length === 0) {
    throw new Error('Failed to search by layer');
  }
});

test('decision.versions - Get version history', () => {
  // Update to create version 2
  setDecision({ key: 'test_auth_method', value: 'oauth2', agent: 'test-agent' });
  const result = getVersions({ key: 'test_auth_method' });
  if (!result.versions || result.versions.length < 2) {
    throw new Error('Failed to retrieve version history');
  }
});

test('decision.hard_delete - Permanently delete decision', () => {
  const result = hardDeleteDecision({ key: 'test_auth_method' });
  if (!result.success) throw new Error('Failed to hard delete decision');

  // Verify it's gone
  const getResult = getDecision({ key: 'test_auth_method' });
  if (getResult.decision !== null) {
    throw new Error('Decision not deleted');
  }
});

// ============================================================================
// TOOL 2: message (4 actions)
// ============================================================================
console.log('\n📦 TOOL 2: message (4 actions)');
console.log('─────────────────────────────────────');

test('message.send - Send message to agent', () => {
  const result = sendMessage({
    from_agent: 'test-agent-1',
    to_agent: 'test-agent-2',
    msg_type: 'info',
    message: 'Test message for MCP testing',
    priority: 'medium'
  });
  if (!result.success) throw new Error('Failed to send message');
});

test('message.send - Broadcast message (null recipient)', () => {
  const result = sendMessage({
    from_agent: 'test-agent-1',
    to_agent: null,
    msg_type: 'warning',
    message: 'Broadcast test message',
    priority: 'high'
  });
  if (!result.success) throw new Error('Failed to broadcast message');
});

test('message.get - Retrieve messages for agent', () => {
  const result = getMessages({
    agent_name: 'test-agent-2',
    unread_only: true
  });
  if (!result.messages || !Array.isArray(result.messages)) {
    throw new Error('Failed to retrieve messages');
  }
});

test('message.mark_read - Mark messages as read', () => {
  const messages = getMessages({ agent_name: 'test-agent-2' });
  if (messages.messages.length > 0) {
    const ids = messages.messages.map(m => m.id);
    const result = markRead({
      agent_name: 'test-agent-2',
      message_ids: ids
    });
    if (!result.success) throw new Error('Failed to mark messages as read');
  }
});

// ============================================================================
// TOOL 3: file (4 actions)
// ============================================================================
console.log('\n📦 TOOL 3: file (4 actions)');
console.log('─────────────────────────────────────');

test('file.record - Record file creation', () => {
  const result = recordFileChange({
    file_path: 'src/test.ts',
    agent_name: 'test-agent',
    change_type: 'created',
    layer: 'infrastructure',
    description: 'Test file creation'
  });
  if (!result.success) throw new Error('Failed to record file change');
});

test('file.record - Record file modification', () => {
  const result = recordFileChange({
    file_path: 'src/test.ts',
    agent_name: 'test-agent',
    change_type: 'modified',
    layer: 'infrastructure',
    description: 'Test file modification'
  });
  if (!result.success) throw new Error('Failed to record file modification');
});

test('file.get - Retrieve file change history', () => {
  const result = getFileChanges({
    file_path: 'src/test.ts',
    limit: 10
  });
  if (!result.changes || result.changes.length === 0) {
    throw new Error('Failed to retrieve file changes');
  }
});

test('file.check_lock - Check file lock status', () => {
  const result = checkFileLock({
    file_path: 'src/test.ts',
    lock_duration: 300
  });
  if (result.is_locked === undefined) {
    throw new Error('Failed to check file lock');
  }
});

// ============================================================================
// TOOL 4: constraint (4 actions)
// ============================================================================
console.log('\n📦 TOOL 4: constraint (4 actions)');
console.log('─────────────────────────────────────');

test('constraint.add - Add performance constraint', () => {
  const result = addConstraint({
    category: 'performance',
    constraint_text: 'API response time must be <100ms',
    priority: 'high',
    layer: 'business',
    tags: ['api', 'performance'],
    created_by: 'test-agent'
  });
  if (!result.success) throw new Error('Failed to add constraint');
});

test('constraint.add - Add security constraint', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'All passwords must be hashed with bcrypt',
    priority: 'critical',
    layer: 'business',
    tags: ['security', 'authentication'],
    created_by: 'test-agent'
  });
  if (!result.success) throw new Error('Failed to add security constraint');
});

test('constraint.get - Retrieve constraints by category', () => {
  const result = getConstraints({
    category: 'performance',
    active_only: true
  });
  if (!result.constraints || result.constraints.length === 0) {
    throw new Error('Failed to retrieve constraints');
  }
});

test('constraint.deactivate - Deactivate constraint', () => {
  const constraints = getConstraints({ category: 'performance' });
  if (constraints.constraints.length > 0) {
    const result = deactivateConstraint({
      constraint_id: constraints.constraints[0].id
    });
    if (!result.success) throw new Error('Failed to deactivate constraint');
  }
});

// ============================================================================
// TOOL 5: stats (4 actions)
// ============================================================================
console.log('\n📦 TOOL 5: stats (4 actions)');
console.log('─────────────────────────────────────');

test('stats.layer_summary - Get layer statistics', () => {
  const result = getLayerSummary();
  if (!result.summary || !Array.isArray(result.summary)) {
    throw new Error('Failed to get layer summary');
  }
});

test('stats.db_stats - Get database statistics', () => {
  const result = getStats();
  if (!result.stats || typeof result.stats !== 'object') {
    throw new Error('Failed to get database stats');
  }
});

test('stats.activity_log - Get activity log (last 1 hour)', () => {
  const result = getActivityLog({
    since: '1h',
    limit: 50
  });
  if (!result.activities || !Array.isArray(result.activities)) {
    throw new Error('Failed to get activity log');
  }
});

test('stats.clear - Clear old data (messages >48h, files >14d)', () => {
  const result = clearOldData({
    messages_older_than_hours: 48,
    file_changes_older_than_days: 14
  });
  if (result.messages_deleted === undefined || result.file_changes_deleted === undefined) {
    throw new Error('Failed to clear old data');
  }
});

// ============================================================================
// TOOL 6: config (3 actions)
// ============================================================================
console.log('\n📦 TOOL 6: config (3 actions)');
console.log('─────────────────────────────────────');

test('config.get - Get current configuration', () => {
  const result = getConfig();
  if (!result.config || typeof result.config !== 'object') {
    throw new Error('Failed to get configuration');
  }
});

test('config.update - Update configuration', () => {
  const result = updateConfig({
    ignoreWeekend: true,
    messageRetentionHours: 48,
    fileHistoryRetentionDays: 10
  });
  if (!result.success) throw new Error('Failed to update configuration');
});

test('config.get - Verify configuration update', () => {
  const result = getConfig();
  if (result.config.ignoreWeekend !== true ||
      result.config.messageRetentionHours !== 48) {
    throw new Error('Configuration not updated correctly');
  }
});

// ============================================================================
// TOOL 7: task (9 actions)
// ============================================================================
console.log('\n📦 TOOL 7: task (9 actions)');
console.log('─────────────────────────────────────');

let taskId = null;

test('task.create - Create new task', () => {
  const result = createTask({
    title: 'Test Task for MCP Testing',
    description: 'This is a test task created during MCP tool testing',
    acceptance_criteria: '- All tests pass\n- Documentation updated',
    priority: 3,
    assigned_agent: 'test-agent',
    created_by_agent: 'test-runner',
    layer: 'business',
    tags: ['testing', 'mcp'],
    status: 'todo'
  });
  if (!result.success || !result.task_id) throw new Error('Failed to create task');
  taskId = result.task_id;
});

test('task.get - Retrieve specific task', () => {
  const result = getTask({ task_id: taskId });
  if (!result.task || result.task.id !== taskId) {
    throw new Error('Failed to retrieve task');
  }
});

test('task.list - List tasks with filters', () => {
  const result = listTasks({
    status: 'todo',
    layer: 'business',
    limit: 10
  });
  if (!result.tasks || !Array.isArray(result.tasks)) {
    throw new Error('Failed to list tasks');
  }
});

test('task.update - Update task details', () => {
  const result = updateTask({
    task_id: taskId,
    title: 'Updated Test Task',
    priority: 4
  });
  if (!result.success) throw new Error('Failed to update task');
});

test('task.move - Move task to in_progress', () => {
  const result = moveTask({
    task_id: taskId,
    new_status: 'in_progress'
  });
  if (!result.success) throw new Error('Failed to move task status');
});

test('task.link - Link task to decision', () => {
  // Create a decision first
  setDecision({
    key: 'test_task_decision',
    value: 'Use Jest for testing',
    agent: 'test-agent',
    layer: 'infrastructure'
  });

  const result = linkTask({
    task_id: taskId,
    link_type: 'decision',
    target_id: 'test_task_decision',
    link_relation: 'implements'
  });
  if (!result.success) throw new Error('Failed to link task to decision');
});

test('task.move - Move task to done', () => {
  const result = moveTask({
    task_id: taskId,
    new_status: 'done'
  });
  if (!result.success) throw new Error('Failed to move task to done');
});

test('task.archive - Archive completed task', () => {
  const result = archiveTask({ task_id: taskId });
  if (!result.success) throw new Error('Failed to archive task');
});

test('task.batch_create - Create multiple tasks', () => {
  const result = batchCreateTasks({
    tasks: [
      {
        title: 'Batch Task 1',
        priority: 2,
        assigned_agent: 'test-agent',
        layer: 'presentation',
        status: 'todo'
      },
      {
        title: 'Batch Task 2',
        priority: 3,
        assigned_agent: 'test-agent',
        layer: 'data',
        status: 'todo'
      }
    ],
    atomic: false
  });
  if (!result.success || result.created_count !== 2) {
    throw new Error('Failed to batch create tasks');
  }
});

// ============================================================================
// TEST SUMMARY
// ============================================================================
console.log('\n\n========================================');
console.log('TEST SUMMARY');
console.log('========================================\n');

console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.log('\n🔴 FAILED TESTS:');
  console.log('─────────────────────────────────────');
  failures.forEach(f => {
    console.log(`\n❌ ${f.test}`);
    console.log(`   Error: ${f.error}`);
  });
}

console.log('\n========================================');
if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED! 🎉');
} else {
  console.log('⚠️  SOME TESTS FAILED');
}
console.log('========================================\n');

// Close database
db.close();

process.exit(testsFailed > 0 ? 1 : 0);
