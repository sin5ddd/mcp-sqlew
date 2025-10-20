#!/usr/bin/env node
/**
 * Decision Context Testing Script (v3.2.2)
 * Tests add_decision_context, list_decision_contexts, and get with include_context
 */

import { initializeDatabase } from '../dist/database.js';
import {
  setDecision,
  getDecision,
  addDecisionContextAction as addDecisionContext,
  listDecisionContextsAction as listDecisionContexts
} from '../dist/tools/context.js';

// Initialize test database
const db = initializeDatabase('test-decision-context.db');

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('🚀 Decision Context Test Suite (v3.2.2)\n');
console.log('=' .repeat(60));

// ============================================================================
// Setup: Create test decisions
// ============================================================================

console.log('\n📋 Setup: Creating test decisions...');

try {
  setDecision({
    key: 'database_choice',
    value: 'PostgreSQL over MongoDB',
    layer: 'data',
    tags: ['architecture', 'database'],
    agent: 'test-agent'
  });
  console.log('   ✅ Created decision: database_choice');

  setDecision({
    key: 'auth_method',
    value: 'JWT with refresh tokens',
    layer: 'business',
    tags: ['security', 'authentication'],
    agent: 'test-agent'
  });
  console.log('   ✅ Created decision: auth_method');

  setDecision({
    key: 'cache_strategy',
    value: 'Redis with write-through',
    layer: 'infrastructure',
    tags: ['performance', 'caching'],
    agent: 'test-agent'
  });
  console.log('   ✅ Created decision: cache_strategy');

} catch (error) {
  console.error(`   ❌ Setup failed: ${error.message}`);
  process.exit(1);
}

// ============================================================================
// Test 1: add_decision_context - Basic Context (Rationale Only)
// ============================================================================

test('add_decision_context - Basic context with rationale only', () => {
  const result = addDecisionContext({
    key: 'database_choice',
    rationale: 'Selected PostgreSQL because: (1) Complex relational queries required for reporting, (2) ACID compliance critical for financial data, (3) Team has strong SQL expertise'
  });

  assert(result.success === true, 'Should return success: true');
  assert(result.context_id > 0, 'Should return valid context_id');
  assert(result.decision_key === 'database_choice', 'Should return correct decision_key');
  assert(result.message.includes('successfully'), 'Should return success message');
});

// ============================================================================
// Test 2: add_decision_context - Full Context (All Fields)
// ============================================================================

test('add_decision_context - Full context with all fields', () => {
  const result = addDecisionContext({
    key: 'auth_method',
    rationale: 'JWT chosen for stateless authentication that scales horizontally across microservices',
    alternatives_considered: [
      {
        option: 'Session-based auth',
        reason: 'Rejected due to stateful nature requiring shared session store'
      },
      {
        option: 'OAuth2 only',
        reason: 'Rejected as too complex for internal API, JWT sufficient'
      }
    ],
    tradeoffs: {
      pros: ['Stateless', 'Horizontal scaling', 'Mobile-friendly'],
      cons: ['Token revocation complexity', 'Larger payload size']
    },
    decided_by: 'security-team',
    related_task_id: null,
    related_constraint_id: null
  });

  assert(result.success === true, 'Should return success: true');
  assert(result.context_id > 0, 'Should return valid context_id');
  assert(result.decision_key === 'auth_method', 'Should return correct decision_key');
});

// ============================================================================
// Test 3: add_decision_context - Invalid Decision Key
// ============================================================================

test('add_decision_context - Invalid decision key returns error', () => {
  // The function might return success:false instead of throwing
  try {
    const result = addDecisionContext({
      key: 'nonexistent_decision',
      rationale: 'This should fail'
    });
    // If it doesn't throw, check for success:false
    assert(result.success === false, 'Should return success:false for nonexistent key');
  } catch (error) {
    // If it throws, that's also acceptable
    assert(error.message.includes('not found') || error.message.includes('does not exist') || error.message.includes('key'),
           'Should error on nonexistent decision key');
  }
});

// ============================================================================
// Test 4: add_decision_context - Missing Rationale
// ============================================================================

test('add_decision_context - Error on missing rationale', () => {
  try {
    addDecisionContext({
      key: 'database_choice'
      // Missing rationale
    });
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('rationale') || error.message.includes('required'),
           'Should error on missing rationale');
  }
});

// ============================================================================
// Test 5: get - Backward Compatibility (Without include_context)
// ============================================================================

test('get - Backward compatibility without include_context flag', () => {
  const result = getDecision({
    key: 'database_choice'
  });

  assert(result.found === true, 'Should find the decision');
  assert(result.decision.key === 'database_choice', 'Should return decision');
  assert(result.decision.value === 'PostgreSQL over MongoDB', 'Should return correct value');
  assert(result.context === undefined, 'Should NOT include context by default');
});

// ============================================================================
// Test 6: get - With include_context=true
// ============================================================================

test('get - Retrieve decision with include_context=true', () => {
  const result = getDecision({
    key: 'database_choice',
    include_context: true
  });

  assert(result.found === true, 'Should find the decision');
  assert(result.decision.key === 'database_choice', 'Should return decision');
  assert(result.decision.value === 'PostgreSQL over MongoDB', 'Should return correct value');
  assert(Array.isArray(result.context), 'Should include context array');
  assert(result.context.length > 0, 'Should have at least one context');

  const context = result.context[0];
  assert(context.rationale.includes('PostgreSQL'), 'Should include rationale');
  assert(context.decision_key === 'database_choice', 'Context should reference correct decision');
});

// ============================================================================
// Test 7: get - With include_context=true (No Context Attached)
// ============================================================================

test('get - Decision with include_context but no context attached', () => {
  const result = getDecision({
    key: 'cache_strategy',
    include_context: true
  });

  assert(result.found === true, 'Should find the decision');
  assert(result.decision.key === 'cache_strategy', 'Should return decision');
  assert(Array.isArray(result.context), 'Should include context array');
  assert(result.context.length === 0, 'Should have empty context array');
});

// ============================================================================
// Test 8: list_decision_contexts - All Contexts
// ============================================================================

test('list_decision_contexts - List all contexts', () => {
  const result = listDecisionContexts({
    limit: 50
  });

  assert(result.success === true, 'Should return success: true');
  assert(Array.isArray(result.contexts), 'Should return contexts array');
  assert(result.contexts.length >= 2, 'Should have at least 2 contexts');
  assert(typeof result.count === 'number', 'Should return count');
  assert(result.count >= 2, 'Count should be >= 2');
});

// ============================================================================
// Test 9: list_decision_contexts - Filter by decision_key
// ============================================================================

test('list_decision_contexts - Filter by decision_key', () => {
  const result = listDecisionContexts({
    decision_key: 'auth_method'
  });

  assert(result.success === true, 'Should return success: true');
  assert(Array.isArray(result.contexts), 'Should return contexts array');
  assert(result.contexts.length === 1, 'Should have exactly 1 context');
  assert(result.contexts[0].decision_key === 'auth_method', 'Should match decision_key filter');

  // Verify JSON parsing
  const context = result.contexts[0];
  assert(Array.isArray(context.alternatives_considered), 'alternatives_considered should be parsed array');
  assert(typeof context.tradeoffs === 'object', 'tradeoffs should be parsed object');
  assert(Array.isArray(context.tradeoffs.pros), 'tradeoffs.pros should be array');
  assert(Array.isArray(context.tradeoffs.cons), 'tradeoffs.cons should be array');
});

// ============================================================================
// Test 10: list_decision_contexts - Filter by decided_by
// ============================================================================

test('list_decision_contexts - Filter by decided_by', () => {
  const result = listDecisionContexts({
    decided_by: 'security-team'
  });

  assert(result.success === true, 'Should return success: true');
  assert(result.contexts.length === 1, 'Should have exactly 1 context');
  assert(result.contexts[0].decided_by === 'security-team', 'Should match decided_by filter');
});

// ============================================================================
// Test 11: Multiple Contexts on Same Decision
// ============================================================================

test('add_decision_context - Multiple contexts on same decision', () => {
  // Add second context to database_choice
  const result = addDecisionContext({
    key: 'database_choice',
    rationale: 'Follow-up: Confirmed PostgreSQL choice after 6-month review. Performance metrics exceeded expectations.',
    decided_by: 'architecture-team'
  });

  assert(result.success === true, 'Should allow multiple contexts on same decision');

  // List contexts for this decision
  const contexts = listDecisionContexts({
    decision_key: 'database_choice'
  });

  assert(contexts.contexts.length === 2, 'Should have 2 contexts for database_choice');
});

// ============================================================================
// Test 12: Pagination
// ============================================================================

test('list_decision_contexts - Pagination with limit and offset', () => {
  const page1 = listDecisionContexts({
    limit: 1,
    offset: 0
  });

  const page2 = listDecisionContexts({
    limit: 1,
    offset: 1
  });

  assert(page1.contexts.length === 1, 'Page 1 should have 1 context');
  assert(page2.contexts.length === 1, 'Page 2 should have 1 context');
  assert(page1.contexts[0].id !== page2.contexts[0].id, 'Should return different contexts');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('\n📊 Test Summary:');
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📝 Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log('\n❌ Failed Tests:');
  failures.forEach(({ test, error }) => {
    console.log(`   - ${test}`);
    console.log(`     Error: ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 All Decision Context tests passed!');
  process.exit(0);
}
