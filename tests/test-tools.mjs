#!/usr/bin/env node
/**
 * Quick test script for MCP tools
 * Tests the three basic context management tools
 */

import { initializeDatabase } from './dist/database.js';
import { setDecision, getContext, getDecision } from './dist/tools/context.js';

console.log('=== MCP Shared Context Server - Tool Tests ===\n');

// Initialize database in memory for testing
console.log('1. Initializing test database...');
const db = initializeDatabase(':memory:');
console.log('✓ Database initialized\n');

// Test 1: set_decision with string value
console.log('2. Testing set_decision (string value)...');
try {
  const result1 = setDecision({
    key: 'auth_method',
    value: 'JWT',
    agent: 'auth-agent',
    layer: 'business',
    tags: ['authentication', 'security'],
    scopes: ['user-service'],
    version: '1.0.0',
    status: 'active'
  });
  console.log('✓ Result:', JSON.stringify(result1, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 2: set_decision with numeric value
console.log('3. Testing set_decision (numeric value)...');
try {
  const result2 = setDecision({
    key: 'max_connections',
    value: 100,
    agent: 'db-agent',
    layer: 'data',
    tags: ['performance', 'database'],
    version: '1.0.0'
  });
  console.log('✓ Result:', JSON.stringify(result2, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 3: get_context (all decisions)
console.log('4. Testing get_context (all decisions)...');
try {
  const result3 = getContext({});
  console.log('✓ Found', result3.count, 'decisions');
  console.log('Decisions:', JSON.stringify(result3.decisions, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 4: get_context with filters
console.log('5. Testing get_context (filtered by layer)...');
try {
  const result4 = getContext({ layer: 'business' });
  console.log('✓ Found', result4.count, 'decisions in business layer');
  console.log('Decisions:', JSON.stringify(result4.decisions, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 5: get_context with tag filter
console.log('6. Testing get_context (filtered by tags)...');
try {
  const result5 = getContext({ tags: ['security'], tag_match: 'OR' });
  console.log('✓ Found', result5.count, 'decisions with security tag');
  console.log('Decisions:', JSON.stringify(result5.decisions, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 6: get_decision
console.log('7. Testing get_decision...');
try {
  const result6 = getDecision({ key: 'auth_method' });
  console.log('✓ Found:', result6.found);
  if (result6.decision) {
    console.log('Decision:', JSON.stringify(result6.decision, null, 2));
  }
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 7: get_decision (not found)
console.log('8. Testing get_decision (not found)...');
try {
  const result7 = getDecision({ key: 'nonexistent_key' });
  console.log('✓ Found:', result7.found);
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

// Test 8: Update existing decision
console.log('9. Testing set_decision (update existing)...');
try {
  const result8 = setDecision({
    key: 'auth_method',
    value: 'OAuth2',
    agent: 'auth-agent',
    version: '2.0.0',
    status: 'active'
  });
  console.log('✓ Result:', JSON.stringify(result8, null, 2));

  const updated = getDecision({ key: 'auth_method' });
  console.log('Updated decision:', JSON.stringify(updated.decision, null, 2));
} catch (error) {
  console.error('✗ Error:', error.message);
}
console.log();

console.log('=== All tests completed ===');
