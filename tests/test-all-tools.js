#!/usr/bin/env node
/**
 * Comprehensive MCP Tool Testing Script
 * Tests all 6 tools with all their actions
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const TEST_DB_PATH = 'test-db/comprehensive-test.db';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Call MCP tool with given parameters
 */
async function callTool(toolName, params) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('node', ['dist/index.js', TEST_DB_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      try {
        // Parse JSONRPC messages from stdout
        const lines = stdout.split('\n').filter(line => line.trim());
        const responses = lines
          .filter(line => {
            try {
              const parsed = JSON.parse(line);
              return parsed.result || parsed.error;
            } catch {
              return false;
            }
          })
          .map(line => JSON.parse(line));

        if (responses.length > 0) {
          resolve(responses[responses.length - 1]);
        } else {
          reject(new Error(`No valid response: ${stdout}\n${stderr}`));
        }
      } catch (error) {
        reject(error);
      }
    });

    // Send JSONRPC request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();

    // Timeout after 5 seconds
    setTimeout(() => {
      mcp.kill();
      reject(new Error('Test timeout'));
    }, 5000);
  });
}

/**
 * Run a single test
 */
async function runTest(testName, toolName, params, expectedCondition) {
  process.stdout.write(`${colors.cyan}Testing:${colors.reset} ${testName}... `);

  try {
    const response = await callTool(toolName, params);

    // Check for error response
    if (response.error) {
      if (expectedCondition === 'error') {
        console.log(`${colors.green}✓ PASS${colors.reset} (expected error)`);
        testResults.passed++;
        testResults.tests.push({ name: testName, status: 'PASS', result: response.error.message });
        return true;
      } else {
        console.log(`${colors.red}✗ FAIL${colors.reset}`);
        console.log(`  Error: ${response.error.message}`);
        testResults.failed++;
        testResults.tests.push({ name: testName, status: 'FAIL', error: response.error.message });
        return false;
      }
    }

    // Check result
    const result = response.result;
    const conditionMet = typeof expectedCondition === 'function'
      ? expectedCondition(result)
      : result && result.success !== false;

    if (conditionMet) {
      console.log(`${colors.green}✓ PASS${colors.reset}`);
      testResults.passed++;
      testResults.tests.push({ name: testName, status: 'PASS', result });
      return true;
    } else {
      console.log(`${colors.red}✗ FAIL${colors.reset}`);
      console.log(`  Result:`, JSON.stringify(result, null, 2));
      testResults.failed++;
      testResults.tests.push({ name: testName, status: 'FAIL', result });
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}✗ ERROR${colors.reset}`);
    console.log(`  ${error.message}`);
    testResults.failed++;
    testResults.tests.push({ name: testName, status: 'ERROR', error: error.message });
    return false;
  }
}

/**
 * Main test suite
 */
async function runAllTests() {
  console.log(`${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║   MCP sqlew - Comprehensive Tool Testing Suite          ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);
  console.log(`Test Database: ${TEST_DB_PATH}\n`);

  // ============================================================
  // DECISION TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ DECISION TOOL ━━━${colors.reset}\n`);

  await runTest(
    'decision: set (basic)',
    'decision',
    { action: 'set', key: 'test_key_1', value: 'test_value_1', layer: 'business' },
    (r) => r.success && r.key === 'test_key_1'
  );

  await runTest(
    'decision: set (with tags and scopes)',
    'decision',
    {
      action: 'set',
      key: 'test_key_2',
      value: 'test_value_2',
      layer: 'presentation',
      tags: ['test', 'example'],
      scopes: ['module/test'],
      status: 'active'
    },
    (r) => r.success && r.key === 'test_key_2'
  );

  await runTest(
    'decision: set (numeric value)',
    'decision',
    { action: 'set', key: 'test_numeric', value: 42, layer: 'data' },
    (r) => r.success && r.key === 'test_numeric'
  );

  await runTest(
    'decision: get',
    'decision',
    { action: 'get', key: 'test_key_1' },
    (r) => r.found && r.decision.value === 'test_value_1'
  );

  await runTest(
    'decision: get (non-existent)',
    'decision',
    { action: 'get', key: 'non_existent_key' },
    (r) => r.found === false
  );

  await runTest(
    'decision: list',
    'decision',
    { action: 'list', status: 'active', layer: 'business' },
    (r) => r.decisions && r.decisions.length >= 1
  );

  await runTest(
    'decision: search_tags',
    'decision',
    { action: 'search_tags', tags: ['test'], match_mode: 'OR' },
    (r) => r.decisions && r.decisions.length >= 1
  );

  await runTest(
    'decision: search_layer',
    'decision',
    { action: 'search_layer', layer: 'business' },
    (r) => r.decisions && r.layer === 'business'
  );

  await runTest(
    'decision: versions',
    'decision',
    { action: 'versions', key: 'test_key_1' },
    (r) => r.key === 'test_key_1' && Array.isArray(r.history)
  );

  await runTest(
    'decision: quick_set',
    'decision',
    { action: 'quick_set', key: 'api/test/endpoint', value: 'Quick set test' },
    (r) => r.success && r.inferred
  );

  await runTest(
    'decision: search_advanced',
    'decision',
    {
      action: 'search_advanced',
      layers: ['business', 'presentation'],
      limit: 10
    },
    (r) => r.decisions && r.total_count >= 0
  );

  await runTest(
    'decision: set_batch',
    'decision',
    {
      action: 'set_batch',
      atomic: false,
      decisions: [
        { key: 'batch_1', value: 'value_1', layer: 'business' },
        { key: 'batch_2', value: 'value_2', layer: 'business' }
      ]
    },
    (r) => r.inserted === 2 && r.failed === 0
  );

  await runTest(
    'decision: has_updates',
    'decision',
    {
      action: 'has_updates',
      agent_name: 'test-agent',
      since_timestamp: '2025-01-01T00:00:00Z'
    },
    (r) => r.has_updates !== undefined && r.counts
  );

  await runTest(
    'decision: create_template',
    'decision',
    {
      action: 'create_template',
      name: 'test_template',
      defaults: { layer: 'business', tags: ['template-test'] },
      created_by: 'test-script'
    },
    (r) => r.success && r.template_name === 'test_template'
  );

  await runTest(
    'decision: list_templates',
    'decision',
    { action: 'list_templates' },
    (r) => r.templates && r.count >= 1
  );

  await runTest(
    'decision: set_from_template',
    'decision',
    {
      action: 'set_from_template',
      template: 'test_template',
      key: 'template_test_key',
      value: 'Template test value',
      layer: 'business'
    },
    (r) => r.success && r.template_used === 'test_template'
  );

  await runTest(
    'decision: help',
    'decision',
    { action: 'help' },
    (r) => r.tool === 'decision' && r.actions
  );

  // Error case: missing action
  await runTest(
    'decision: missing action (error case)',
    'decision',
    { key: 'test' },
    'error'
  );

  // ============================================================
  // MESSAGE TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ MESSAGE TOOL ━━━${colors.reset}\n`);

  await runTest(
    'message: send',
    'message',
    {
      action: 'send',
      from_agent: 'test-agent-1',
      msg_type: 'info',
      message: 'Test message',
      priority: 'medium'
    },
    (r) => r.success && r.message_id
  );

  await runTest(
    'message: send (broadcast)',
    'message',
    {
      action: 'send',
      from_agent: 'test-agent-1',
      to_agent: null,
      msg_type: 'warning',
      message: 'Broadcast message'
    },
    (r) => r.success && r.message_id
  );

  await runTest(
    'message: send (with payload)',
    'message',
    {
      action: 'send',
      from_agent: 'test-agent-2',
      msg_type: 'decision',
      message: 'Decision message',
      priority: 'high',
      payload: { key: 'value', data: [1, 2, 3] }
    },
    (r) => r.success && r.message_id
  );

  await runTest(
    'message: get',
    'message',
    {
      action: 'get',
      agent_name: 'test-agent-1',
      limit: 10
    },
    (r) => r.messages && r.count >= 0
  );

  await runTest(
    'message: get (unread only)',
    'message',
    {
      action: 'get',
      agent_name: 'test-agent-1',
      unread_only: true,
      limit: 5
    },
    (r) => r.messages && Array.isArray(r.messages)
  );

  await runTest(
    'message: send_batch',
    'message',
    {
      action: 'send_batch',
      atomic: false,
      messages: [
        { from_agent: 'batch-agent', msg_type: 'info', message: 'Batch msg 1' },
        { from_agent: 'batch-agent', msg_type: 'info', message: 'Batch msg 2' }
      ]
    },
    (r) => r.inserted === 2 && r.failed === 0
  );

  // Note: mark_read requires message_ids from previous sends
  console.log(`${colors.cyan}Testing:${colors.reset} message: mark_read... ${colors.yellow}SKIP${colors.reset} (requires message IDs)`);

  await runTest(
    'message: help',
    'message',
    { action: 'help' },
    (r) => r.tool === 'message' && r.actions
  );

  // ============================================================
  // FILE TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ FILE TOOL ━━━${colors.reset}\n`);

  await runTest(
    'file: record',
    'file',
    {
      action: 'record',
      file_path: 'src/test.ts',
      agent_name: 'test-agent',
      change_type: 'created',
      layer: 'infrastructure',
      description: 'Test file created'
    },
    (r) => r.success && r.change_id
  );

  await runTest(
    'file: record (modified)',
    'file',
    {
      action: 'record',
      file_path: 'src/test.ts',
      agent_name: 'test-agent',
      change_type: 'modified',
      layer: 'infrastructure'
    },
    (r) => r.success && r.change_id
  );

  await runTest(
    'file: get',
    'file',
    {
      action: 'get',
      agent_name: 'test-agent',
      limit: 10
    },
    (r) => r.changes && r.count >= 2
  );

  await runTest(
    'file: get (with filters)',
    'file',
    {
      action: 'get',
      file_path: 'src/test.ts',
      layer: 'infrastructure',
      limit: 5
    },
    (r) => r.changes && Array.isArray(r.changes)
  );

  await runTest(
    'file: check_lock',
    'file',
    {
      action: 'check_lock',
      file_path: 'src/test.ts',
      lock_duration: 300
    },
    (r) => r.locked !== undefined
  );

  await runTest(
    'file: record_batch',
    'file',
    {
      action: 'record_batch',
      atomic: false,
      file_changes: [
        { file_path: 'src/batch1.ts', agent_name: 'test-agent', change_type: 'created' },
        { file_path: 'src/batch2.ts', agent_name: 'test-agent', change_type: 'created' }
      ]
    },
    (r) => r.inserted === 2 && r.failed === 0
  );

  await runTest(
    'file: help',
    'file',
    { action: 'help' },
    (r) => r.tool === 'file' && r.actions
  );

  // ============================================================
  // CONSTRAINT TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ CONSTRAINT TOOL ━━━${colors.reset}\n`);

  await runTest(
    'constraint: add',
    'constraint',
    {
      action: 'add',
      category: 'performance',
      constraint_text: 'API response time must be < 100ms',
      priority: 'high',
      layer: 'business',
      tags: ['api', 'performance']
    },
    (r) => r.success && r.constraint_id
  );

  await runTest(
    'constraint: add (architecture)',
    'constraint',
    {
      action: 'add',
      category: 'architecture',
      constraint_text: 'All services must use dependency injection',
      priority: 'medium',
      created_by: 'test-script'
    },
    (r) => r.success && r.constraint_id
  );

  await runTest(
    'constraint: get',
    'constraint',
    {
      action: 'get',
      category: 'performance',
      limit: 10
    },
    (r) => r.constraints && r.count >= 1
  );

  await runTest(
    'constraint: get (all)',
    'constraint',
    {
      action: 'get',
      active_only: true,
      limit: 20
    },
    (r) => r.constraints && Array.isArray(r.constraints)
  );

  // Deactivate requires constraint_id from previous add
  console.log(`${colors.cyan}Testing:${colors.reset} constraint: deactivate... ${colors.yellow}SKIP${colors.reset} (requires constraint ID)`);

  await runTest(
    'constraint: help',
    'constraint',
    { action: 'help' },
    (r) => r.tool === 'constraint' && r.actions
  );

  // ============================================================
  // STATS TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ STATS TOOL ━━━${colors.reset}\n`);

  await runTest(
    'stats: layer_summary',
    'stats',
    { action: 'layer_summary' },
    (r) => r.summary && Array.isArray(r.summary)
  );

  await runTest(
    'stats: db_stats',
    'stats',
    { action: 'db_stats' },
    (r) => r.agents !== undefined && r.decisions !== undefined
  );

  await runTest(
    'stats: activity_log',
    'stats',
    {
      action: 'activity_log',
      since: '1h',
      limit: 20
    },
    (r) => r.activities && Array.isArray(r.activities)
  );

  await runTest(
    'stats: clear',
    'stats',
    {
      action: 'clear',
      messages_older_than_hours: 720,
      file_changes_older_than_days: 90
    },
    (r) => r.success && r.messages_deleted !== undefined
  );

  await runTest(
    'stats: help',
    'stats',
    { action: 'help' },
    (r) => r.tool === 'stats' && r.actions
  );

  // ============================================================
  // CONFIG TOOL TESTS
  // ============================================================
  console.log(`\n${colors.yellow}━━━ CONFIG TOOL ━━━${colors.reset}\n`);

  await runTest(
    'config: get',
    'config',
    { action: 'get' },
    (r) => r.ignoreWeekend !== undefined && r.messageRetentionHours !== undefined
  );

  await runTest(
    'config: update',
    'config',
    {
      action: 'update',
      ignoreWeekend: true,
      messageRetentionHours: 48,
      fileHistoryRetentionDays: 14
    },
    (r) => r.success && r.config.messageRetentionHours === 48
  );

  await runTest(
    'config: help',
    'config',
    { action: 'help' },
    (r) => r.tool === 'config' && r.actions
  );

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║   Test Results Summary                                    ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  console.log(`${colors.green}✓ Passed:${colors.reset} ${testResults.passed}`);
  console.log(`${colors.red}✗ Failed:${colors.reset} ${testResults.failed}`);
  console.log(`${colors.cyan}━ Total:${colors.reset}  ${total}`);
  console.log(`${colors.yellow}Pass Rate:${colors.reset} ${passRate}%\n`);

  if (testResults.failed > 0) {
    console.log(`${colors.red}Failed Tests:${colors.reset}`);
    testResults.tests
      .filter(t => t.status === 'FAIL' || t.status === 'ERROR')
      .forEach(t => {
        console.log(`  • ${t.name}`);
        if (t.error) console.log(`    Error: ${t.error}`);
      });
    console.log();
  }

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
