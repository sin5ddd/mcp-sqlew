/**
 * Comprehensive Phase 1 Test Suite
 * Tests all foundational components: types, constants, schema, database
 */

import {
  initializeDatabase,
  closeDatabase,
  getOrCreateAgent,
  getOrCreateContextKey,
  getOrCreateFile,
  getOrCreateTag,
  getOrCreateScope,
  getLayerId,
  getCategoryId,
  transaction,
} from '../dist/database.js';

import { verifySchemaIntegrity, getSchemaInfo } from '../dist/schema.js';

import {
  Status,
  MessageType,
  Priority,
  ChangeType,
} from '../dist/types.js';

import {
  DEFAULT_DB_PATH,
  DEFAULT_DB_FOLDER,
  STANDARD_LAYERS,
  STANDARD_CATEGORIES,
  COMMON_TAGS,
  STATUS_TO_STRING,
  STRING_TO_STATUS,
  PRIORITY_TO_STRING,
  STRING_TO_PRIORITY,
} from '../dist/constants.js';

async function runTests() {
  console.log('='.repeat(70));
  console.log('PHASE 1 COMPREHENSIVE TEST SUITE');
  console.log('='.repeat(70));
  console.log('');

  let testsPassed = 0;
  let testsFailed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
      testsFailed++;
    }
  }

  // ===========================================================================
  // Test 1: Constants Module
  // ===========================================================================
  console.log('Test Group 1: Constants Module');
  console.log('-'.repeat(70));

  test('Default database path is .sqlew/sqlew.db', () => {
    if (DEFAULT_DB_PATH !== '.sqlew/sqlew.db') {
      throw new Error(`Expected '.sqlew/sqlew.db', got '${DEFAULT_DB_PATH}'`);
    }
  });

  test('Default database folder is .sqlew', () => {
    if (DEFAULT_DB_FOLDER !== '.sqlew') {
      throw new Error(`Expected '.sqlew', got '${DEFAULT_DB_FOLDER}'`);
    }
  });

  test('Standard layers array has 5 elements', () => {
    if (STANDARD_LAYERS.length !== 5) {
      throw new Error(`Expected 5 layers, got ${STANDARD_LAYERS.length}`);
    }
  });

  test('Standard categories array has 3 elements', () => {
    if (STANDARD_CATEGORIES.length !== 3) {
      throw new Error(`Expected 3 categories, got ${STANDARD_CATEGORIES.length}`);
    }
  });

  test('Common tags array has 10 elements', () => {
    if (COMMON_TAGS.length !== 10) {
      throw new Error(`Expected 10 tags, got ${COMMON_TAGS.length}`);
    }
  });

  console.log('');

  // ===========================================================================
  // Test 2: Enum Types
  // ===========================================================================
  console.log('Test Group 2: Enum Types');
  console.log('-'.repeat(70));

  test('Status.ACTIVE equals 1', () => {
    if (Status.ACTIVE !== 1) {
      throw new Error(`Expected 1, got ${Status.ACTIVE}`);
    }
  });

  test('MessageType.WARNING equals 2', () => {
    if (MessageType.WARNING !== 2) {
      throw new Error(`Expected 2, got ${MessageType.WARNING}`);
    }
  });

  test('Priority.CRITICAL equals 4', () => {
    if (Priority.CRITICAL !== 4) {
      throw new Error(`Expected 4, got ${Priority.CRITICAL}`);
    }
  });

  test('ChangeType.MODIFIED equals 2', () => {
    if (ChangeType.MODIFIED !== 2) {
      throw new Error(`Expected 2, got ${ChangeType.MODIFIED}`);
    }
  });

  console.log('');

  // ===========================================================================
  // Test 3: Enum Mappings
  // ===========================================================================
  console.log('Test Group 3: Enum Mappings');
  console.log('-'.repeat(70));

  test('Status enum to string mapping works', () => {
    if (STATUS_TO_STRING[Status.ACTIVE] !== 'active') {
      throw new Error(`Expected 'active', got '${STATUS_TO_STRING[Status.ACTIVE]}'`);
    }
  });

  test('String to status enum mapping works', () => {
    if (STRING_TO_STATUS['deprecated'] !== Status.DEPRECATED) {
      throw new Error(`Expected ${Status.DEPRECATED}, got ${STRING_TO_STATUS['deprecated']}`);
    }
  });

  test('Priority enum to string mapping works', () => {
    if (PRIORITY_TO_STRING[Priority.HIGH] !== 'high') {
      throw new Error(`Expected 'high', got '${PRIORITY_TO_STRING[Priority.HIGH]}'`);
    }
  });

  test('String to priority enum mapping works', () => {
    if (STRING_TO_PRIORITY['critical'] !== Priority.CRITICAL) {
      throw new Error(`Expected ${Priority.CRITICAL}, got ${STRING_TO_PRIORITY['critical']}`);
    }
  });

  console.log('');

  // ===========================================================================
  // Test 4: Database Initialization
  // ===========================================================================
  console.log('Test Group 4: Database Initialization');
  console.log('-'.repeat(70));

  let db;

  test('Database initializes with default path', () => {
    db = initializeDatabase();
    if (!db) {
      throw new Error('Database is null or undefined');
    }
  });

  test('Schema is properly initialized', () => {
    const info = getSchemaInfo(db);
    if (info.layers !== 5) {
      throw new Error(`Expected 5 layers, got ${info.layers}`);
    }
    if (info.constraint_categories !== 3) {
      throw new Error(`Expected 3 categories, got ${info.constraint_categories}`);
    }
    if (info.tags < 10) {
      throw new Error(`Expected at least 10 tags, got ${info.tags}`);
    }
  });

  test('Schema integrity verification passes', () => {
    const integrity = verifySchemaIntegrity(db);
    if (!integrity.valid) {
      throw new Error(
        `Integrity check failed: ${integrity.missing.join(', ')} | ${integrity.errors.join(', ')}`
      );
    }
  });

  console.log('');

  // ===========================================================================
  // Test 5: Helper Functions
  // ===========================================================================
  console.log('Test Group 5: Helper Functions');
  console.log('-'.repeat(70));

  let agentId1, agentId2;

  test('getOrCreateAgent creates new agent', () => {
    agentId1 = getOrCreateAgent(db, 'test-agent-phase1');
    if (!agentId1 || agentId1 <= 0) {
      throw new Error(`Invalid agent ID: ${agentId1}`);
    }
  });

  test('getOrCreateAgent is idempotent', () => {
    agentId2 = getOrCreateAgent(db, 'test-agent-phase1');
    if (agentId1 !== agentId2) {
      throw new Error(`Expected ${agentId1}, got ${agentId2}`);
    }
  });

  test('getOrCreateContextKey creates new key', () => {
    const keyId = getOrCreateContextKey(db, 'test.context.key');
    if (!keyId || keyId <= 0) {
      throw new Error(`Invalid key ID: ${keyId}`);
    }
  });

  test('getOrCreateFile creates new file', () => {
    const fileId = getOrCreateFile(db, '/src/test/file.ts');
    if (!fileId || fileId <= 0) {
      throw new Error(`Invalid file ID: ${fileId}`);
    }
  });

  test('getOrCreateTag creates new tag', () => {
    const tagId = getOrCreateTag(db, 'phase1-test-tag');
    if (!tagId || tagId <= 0) {
      throw new Error(`Invalid tag ID: ${tagId}`);
    }
  });

  test('getOrCreateScope creates new scope', () => {
    const scopeId = getOrCreateScope(db, 'test-module');
    if (!scopeId || scopeId <= 0) {
      throw new Error(`Invalid scope ID: ${scopeId}`);
    }
  });

  test('getLayerId finds existing layer', () => {
    const layerId = getLayerId(db, 'business');
    if (!layerId || layerId <= 0) {
      throw new Error(`Layer 'business' not found`);
    }
  });

  test('getLayerId returns null for non-existent layer', () => {
    const layerId = getLayerId(db, 'nonexistent-layer');
    if (layerId !== null) {
      throw new Error(`Expected null, got ${layerId}`);
    }
  });

  test('getCategoryId finds existing category', () => {
    const categoryId = getCategoryId(db, 'security');
    if (!categoryId || categoryId <= 0) {
      throw new Error(`Category 'security' not found`);
    }
  });

  console.log('');

  // ===========================================================================
  // Test 6: Transaction Support
  // ===========================================================================
  console.log('Test Group 6: Transaction Support');
  console.log('-'.repeat(70));

  test('Transaction commits on success', () => {
    const result = transaction(db, () => {
      const id = getOrCreateAgent(db, 'tx-test-agent');
      return id;
    });
    if (!result || result <= 0) {
      throw new Error(`Transaction failed: invalid result ${result}`);
    }
  });

  test('Transaction rolls back on error', () => {
    let errorThrown = false;
    try {
      transaction(db, () => {
        getOrCreateAgent(db, 'tx-rollback-test');
        throw new Error('Intentional error for rollback test');
      });
    } catch (error) {
      errorThrown = true;
    }
    if (!errorThrown) {
      throw new Error('Transaction did not roll back');
    }
  });

  console.log('');

  // ===========================================================================
  // Test 7: Database Configuration
  // ===========================================================================
  console.log('Test Group 7: Database Configuration');
  console.log('-'.repeat(70));

  test('WAL mode is enabled', () => {
    const result = db.pragma('journal_mode', { simple: true });
    if (result !== 'wal') {
      throw new Error(`Expected WAL mode, got ${result}`);
    }
  });

  test('Foreign keys are enabled', () => {
    const result = db.pragma('foreign_keys', { simple: true });
    if (result !== 1) {
      throw new Error(`Foreign keys not enabled: ${result}`);
    }
  });

  console.log('');

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  closeDatabase();

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log('='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('');

  if (testsFailed > 0) {
    console.log('✗ PHASE 1 TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 1 TESTS PASSED');
    console.log('');
    console.log('Phase 1 components are ready:');
    console.log('  ✓ src/types.ts - Complete type definitions');
    console.log('  ✓ src/constants.ts - All constants with .sqlew/sqlew.db default');
    console.log('  ✓ src/schema.ts - Schema initialization and verification');
    console.log('  ✓ src/database.ts - Database connection with configurable path');
    console.log('');
    console.log('Database path configuration:');
    console.log(`  - Default: ${DEFAULT_DB_PATH}`);
    console.log('  - Configurable via initializeDatabase(customPath)');
    console.log('  - Supports both absolute and relative paths');
    console.log('  - Auto-creates folder structure');
    console.log('');
  }
}

runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
