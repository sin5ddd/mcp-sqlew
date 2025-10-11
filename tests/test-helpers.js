#!/usr/bin/env node
/**
 * Test helper functions
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
  transaction
} from './dist/database.js';

console.log('Testing helper functions...\n');

try {
  const db = initializeDatabase('.test-helpers/test.db');

  // Test getOrCreate functions
  console.log('[Test 1] Testing getOrCreateAgent...');
  const agent1 = getOrCreateAgent(db, 'test-agent-1');
  const agent2 = getOrCreateAgent(db, 'test-agent-2');
  const agent1Repeat = getOrCreateAgent(db, 'test-agent-1');
  console.log(`✓ Created agents: ${agent1}, ${agent2}`);
  console.log(`✓ Idempotent: agent1=${agent1}, repeat=${agent1Repeat} (should match)`);

  console.log('\n[Test 2] Testing getOrCreateContextKey...');
  const key1 = getOrCreateContextKey(db, 'database.url');
  const key2 = getOrCreateContextKey(db, 'api.endpoint');
  console.log(`✓ Created keys: ${key1}, ${key2}`);

  console.log('\n[Test 3] Testing getOrCreateFile...');
  const file1 = getOrCreateFile(db, '/src/index.ts');
  const file2 = getOrCreateFile(db, '/src/database.ts');
  console.log(`✓ Created files: ${file1}, ${file2}`);

  console.log('\n[Test 4] Testing getOrCreateTag...');
  const tag1 = getOrCreateTag(db, 'custom-tag');
  const tag2 = getOrCreateTag(db, 'another-tag');
  console.log(`✓ Created tags: ${tag1}, ${tag2}`);

  console.log('\n[Test 5] Testing getOrCreateScope...');
  const scope1 = getOrCreateScope(db, 'auth-module');
  const scope2 = getOrCreateScope(db, 'api-module');
  console.log(`✓ Created scopes: ${scope1}, ${scope2}`);

  console.log('\n[Test 6] Testing getLayerId (predefined)...');
  const layer1 = getLayerId(db, 'business');
  const layer2 = getLayerId(db, 'presentation');
  const layerNull = getLayerId(db, 'nonexistent');
  console.log(`✓ Found layers: business=${layer1}, presentation=${layer2}`);
  console.log(`✓ Null for nonexistent: ${layerNull}`);

  console.log('\n[Test 7] Testing getCategoryId (predefined)...');
  const cat1 = getCategoryId(db, 'performance');
  const cat2 = getCategoryId(db, 'security');
  const catNull = getCategoryId(db, 'nonexistent');
  console.log(`✓ Found categories: performance=${cat1}, security=${cat2}`);
  console.log(`✓ Null for nonexistent: ${catNull}`);

  console.log('\n[Test 8] Testing transaction helper...');
  const result = transaction(db, () => {
    const a = getOrCreateAgent(db, 'tx-agent');
    const k = getOrCreateContextKey(db, 'tx-key');
    return { agent: a, key: k };
  });
  console.log(`✓ Transaction successful: ${JSON.stringify(result)}`);

  console.log('\n[Test 9] Testing transaction rollback...');
  try {
    transaction(db, () => {
      getOrCreateAgent(db, 'rollback-agent');
      throw new Error('Intentional error');
    });
  } catch (e) {
    // Check agent was not created
    const check = db.prepare('SELECT id FROM agents WHERE name = ?').get('rollback-agent');
    console.log(`✓ Transaction rolled back: agent not created (${check === undefined})`);
  }

  closeDatabase();

  console.log('\n✓ All helper function tests passed!');

} catch (error) {
  console.error('✗ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
