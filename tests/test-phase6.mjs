#!/usr/bin/env node
/**
 * Phase 6 Test Suite: Constraint Management
 * Tests add_constraint, get_constraints, and deactivate_constraint tools
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __dirname = dirname(fileURLToPath(import.meta.url));

// Import tools
const { addConstraint, getConstraints, deactivateConstraint } = await import('./dist/tools/constraints.js');

// Test database path
const TEST_DB_PATH = './.sqlew/test-phase6.db';

// Test utilities
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

function assertEquals(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertGreaterThan(actual, expected, message = '') {
  if (actual <= expected) {
    throw new Error(`${message}\n  Expected > ${expected}\n  Actual: ${actual}`);
  }
}

function assertContains(array, value, message = '') {
  if (!array.includes(value)) {
    throw new Error(`${message}\n  Array does not contain: ${value}`);
  }
}

function assertNotNull(value, message = '') {
  if (value === null || value === undefined) {
    throw new Error(`${message}\n  Value is null or undefined`);
  }
}

// Setup test database
console.log('Setting up test database...');

// Initialize database using the database module
const databaseModule = await import('./dist/database.js');
const { initializeDatabase, closeDatabase } = databaseModule;

// Initialize with test database path
const db = initializeDatabase(TEST_DB_PATH);

console.log('✓ Test database initialized\n');

// ============================================================================
// Phase 6: Constraint Management Tests
// ============================================================================

console.log('=== PHASE 6: CONSTRAINT MANAGEMENT TESTS ===\n');

// Test 1: Add constraint - performance category
test('Add constraint with performance category', () => {
  const result = addConstraint({
    category: 'performance',
    constraint_text: 'API response time must be under 200ms',
  });

  assertEquals(result.success, true, 'Should return success');
  assertGreaterThan(result.constraint_id, 0, 'Should return constraint ID');
});

// Test 2: Add constraint - architecture category
test('Add constraint with architecture category', () => {
  const result = addConstraint({
    category: 'architecture',
    constraint_text: 'Use microservices pattern for service isolation',
  });

  assertEquals(result.success, true, 'Should return success');
  assertGreaterThan(result.constraint_id, 0, 'Should return constraint ID');
});

// Test 3: Add constraint - security category
test('Add constraint with security category', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'All API endpoints must use JWT authentication',
  });

  assertEquals(result.success, true, 'Should return success');
  assertGreaterThan(result.constraint_id, 0, 'Should return constraint ID');
});

// Test 4: Add constraint with priority - low
test('Add constraint with low priority', () => {
  const result = addConstraint({
    category: 'performance',
    constraint_text: 'Cache static assets for 7 days',
    priority: 'low',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 5: Add constraint with priority - medium (default)
test('Add constraint with medium priority (default)', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'Use HTTPS for all connections',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 6: Add constraint with priority - high
test('Add constraint with high priority', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'Encrypt sensitive data at rest',
    priority: 'high',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 7: Add constraint with priority - critical
test('Add constraint with critical priority', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'Validate all user inputs to prevent SQL injection',
    priority: 'critical',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 8: Add constraint with layer - presentation
test('Add constraint with presentation layer', () => {
  const result = addConstraint({
    category: 'architecture',
    constraint_text: 'Use React components for UI',
    layer: 'presentation',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 9: Add constraint with layer - business
test('Add constraint with business layer', () => {
  const result = addConstraint({
    category: 'architecture',
    constraint_text: 'Implement domain-driven design patterns',
    layer: 'business',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 10: Add constraint with layer - data
test('Add constraint with data layer', () => {
  const result = addConstraint({
    category: 'performance',
    constraint_text: 'Use connection pooling for database',
    layer: 'data',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 11: Add constraint with tags
test('Add constraint with tags', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'Implement rate limiting on API',
    tags: ['api', 'security', 'performance'],
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 12: Add constraint with created_by
test('Add constraint with created_by agent', () => {
  const result = addConstraint({
    category: 'architecture',
    constraint_text: 'Follow RESTful API design principles',
    created_by: 'architect-agent',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 13: Add constraint with all metadata (layer, priority, tags, created_by)
test('Add constraint with all metadata', () => {
  const result = addConstraint({
    category: 'security',
    constraint_text: 'Implement OAuth2 for third-party authentication',
    priority: 'high',
    layer: 'infrastructure',
    tags: ['authentication', 'security', 'api'],
    created_by: 'security-agent',
  });

  assertEquals(result.success, true, 'Should return success');
});

// Test 14: Get all constraints
test('Get all constraints (no filters)', () => {
  const result = getConstraints({});

  assertGreaterThan(result.count, 0, 'Should return constraints');
  assertNotNull(result.constraints, 'Should return constraints array');
});

// Test 15: Get constraints by category - performance
test('Get constraints by performance category', () => {
  const result = getConstraints({ category: 'performance' });

  assertGreaterThan(result.count, 0, 'Should return performance constraints');
  result.constraints.forEach(c => {
    assertEquals(c.category, 'performance', 'All constraints should be performance category');
  });
});

// Test 16: Get constraints by category - architecture
test('Get constraints by architecture category', () => {
  const result = getConstraints({ category: 'architecture' });

  assertGreaterThan(result.count, 0, 'Should return architecture constraints');
  result.constraints.forEach(c => {
    assertEquals(c.category, 'architecture', 'All constraints should be architecture category');
  });
});

// Test 17: Get constraints by category - security
test('Get constraints by security category', () => {
  const result = getConstraints({ category: 'security' });

  assertGreaterThan(result.count, 0, 'Should return security constraints');
  result.constraints.forEach(c => {
    assertEquals(c.category, 'security', 'All constraints should be security category');
  });
});

// Test 18: Get constraints by layer
test('Get constraints by layer', () => {
  const result = getConstraints({ layer: 'data' });

  assertGreaterThan(result.count, 0, 'Should return data layer constraints');
  result.constraints.forEach(c => {
    assertEquals(c.layer, 'data', 'All constraints should be in data layer');
  });
});

// Test 19: Get constraints by priority - critical
test('Get constraints by critical priority', () => {
  const result = getConstraints({ priority: 'critical' });

  assertGreaterThan(result.count, 0, 'Should return critical constraints');
  result.constraints.forEach(c => {
    assertEquals(c.priority, 'critical', 'All constraints should be critical priority');
  });
});

// Test 20: Get constraints by priority - high
test('Get constraints by high priority', () => {
  const result = getConstraints({ priority: 'high' });

  assertGreaterThan(result.count, 0, 'Should return high priority constraints');
  result.constraints.forEach(c => {
    assertEquals(c.priority, 'high', 'All constraints should be high priority');
  });
});

// Test 21: Get constraints by tags (OR logic)
test('Get constraints by tags (OR logic)', () => {
  const result = getConstraints({ tags: ['api', 'security'] });

  assertGreaterThan(result.count, 0, 'Should return constraints with api or security tags');
  // Each constraint should have at least one of the tags
  result.constraints.forEach(c => {
    if (c.tags) {
      const hasTags = c.tags.some(t => ['api', 'security'].includes(t));
      assertEquals(hasTags, true, 'Constraint should have at least one matching tag');
    }
  });
});

// Test 22: Get constraints with limit
test('Get constraints with limit', () => {
  const result = getConstraints({ limit: 5 });

  assertEquals(result.count <= 5, true, 'Should respect limit');
});

// Test 23: Get constraints - ordering by priority DESC
test('Get constraints ordered by priority (DESC)', () => {
  const result = getConstraints({});

  if (result.count > 1) {
    const priorities = result.constraints.map(c => c.priority);
    // Check that priorities are in descending order (critical > high > medium > low)
    const priorityValues = { critical: 4, high: 3, medium: 2, low: 1 };
    for (let i = 0; i < priorities.length - 1; i++) {
      const current = priorityValues[priorities[i]];
      const next = priorityValues[priorities[i + 1]];
      assertEquals(current >= next, true, 'Priorities should be in descending order');
    }
  }
});

// Test 24: Deactivate constraint
test('Deactivate constraint', () => {
  // First add a constraint
  const addResult = addConstraint({
    category: 'performance',
    constraint_text: 'Test constraint to deactivate',
  });

  // Then deactivate it
  const deactivateResult = deactivateConstraint({
    constraint_id: addResult.constraint_id,
  });

  assertEquals(deactivateResult.success, true, 'Should deactivate successfully');

  // Verify it's not in active constraints
  const getResult = getConstraints({ category: 'performance' });
  const found = getResult.constraints.find(c => c.id === addResult.constraint_id);
  assertEquals(found, undefined, 'Deactivated constraint should not appear in active constraints');
});

// Test 25: Deactivate constraint - idempotency
test('Deactivate constraint (idempotent)', () => {
  // Add a constraint
  const addResult = addConstraint({
    category: 'architecture',
    constraint_text: 'Test constraint for idempotency',
  });

  // Deactivate it twice
  const deactivateResult1 = deactivateConstraint({
    constraint_id: addResult.constraint_id,
  });
  const deactivateResult2 = deactivateConstraint({
    constraint_id: addResult.constraint_id,
  });

  assertEquals(deactivateResult1.success, true, 'First deactivation should succeed');
  assertEquals(deactivateResult2.success, true, 'Second deactivation should also succeed (idempotent)');
});

// Test 26: Tagged constraints view
test('Tagged constraints view includes all metadata', () => {
  const result = getConstraints({});

  if (result.count > 0) {
    const constraint = result.constraints[0];
    assertNotNull(constraint.id, 'Should have ID');
    assertNotNull(constraint.category, 'Should have category');
    assertNotNull(constraint.constraint_text, 'Should have constraint_text');
    assertNotNull(constraint.priority, 'Should have priority');
    assertNotNull(constraint.created_at, 'Should have created_at timestamp');
  }
});

// Test 27: Complex filter - category + layer
test('Get constraints with category and layer filter', () => {
  const result = getConstraints({
    category: 'architecture',
    layer: 'business',
  });

  result.constraints.forEach(c => {
    assertEquals(c.category, 'architecture', 'Should be architecture category');
    assertEquals(c.layer, 'business', 'Should be business layer');
  });
});

// Test 28: Complex filter - category + priority + tags
test('Get constraints with category, priority, and tags filter', () => {
  const result = getConstraints({
    category: 'security',
    priority: 'high',
    tags: ['authentication'],
  });

  result.constraints.forEach(c => {
    assertEquals(c.category, 'security', 'Should be security category');
    assertEquals(c.priority, 'high', 'Should be high priority');
  });
});

// Test 29: Invalid category validation
test('Add constraint with invalid category (should fail)', () => {
  try {
    addConstraint({
      category: 'invalid-category',
      constraint_text: 'This should fail',
    });
    throw new Error('Should have thrown validation error');
  } catch (error) {
    assertEquals(error.message.includes('Invalid category'), true, 'Should validate category');
  }
});

// Test 30: Invalid priority validation
test('Add constraint with invalid priority (should fail)', () => {
  try {
    addConstraint({
      category: 'performance',
      constraint_text: 'Test constraint',
      priority: 'invalid-priority',
    });
    throw new Error('Should have thrown validation error');
  } catch (error) {
    assertEquals(error.message.includes('Invalid priority'), true, 'Should validate priority');
  }
});

// Test 31: Missing required fields
test('Add constraint without constraint_text (should fail)', () => {
  try {
    addConstraint({
      category: 'performance',
      constraint_text: '',
    });
    throw new Error('Should have thrown validation error');
  } catch (error) {
    assertEquals(error.message.includes('required'), true, 'Should require constraint_text');
  }
});

// Test 32: Deactivate non-existent constraint
test('Deactivate non-existent constraint (should fail)', () => {
  try {
    deactivateConstraint({
      constraint_id: 999999,
    });
    throw new Error('Should have thrown error for non-existent constraint');
  } catch (error) {
    assertEquals(error.message.includes('not found'), true, 'Should report constraint not found');
  }
});

// ============================================================================
// Test Summary
// ============================================================================

console.log('\n=== TEST SUMMARY ===');
console.log(`Total tests: ${testCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

// Cleanup
closeDatabase();

if (failCount === 0) {
  console.log('\n✓ All Phase 6 tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${failCount} test(s) failed`);
  process.exit(1);
}
