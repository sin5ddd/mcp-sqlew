#!/usr/bin/env node
/**
 * Quick test script to verify database initialization
 */

import { initializeDatabase, closeDatabase } from './dist/database.js';
import { getSchemaInfo, verifySchemaIntegrity } from './dist/schema.js';

console.log('='.repeat(60));
console.log('Testing Database Initialization');
console.log('='.repeat(60));

try {
  // Test 1: Initialize with default path
  console.log('\n[Test 1] Initializing database with default path (.sqlew/sqlew.db)');
  const db = initializeDatabase();

  // Test 2: Get schema info
  console.log('\n[Test 2] Getting schema information...');
  const schemaInfo = getSchemaInfo(db);
  console.log('Schema Info:', schemaInfo);

  // Test 3: Verify schema integrity
  console.log('\n[Test 3] Verifying schema integrity...');
  const integrity = verifySchemaIntegrity(db);
  console.log('Integrity Check:', integrity);

  if (integrity.valid) {
    console.log('✓ All schema integrity checks passed!');
  } else {
    console.error('✗ Schema integrity issues found:');
    console.error('  Missing:', integrity.missing);
    console.error('  Errors:', integrity.errors);
    process.exit(1);
  }

  // Test 4: Query a view
  console.log('\n[Test 4] Testing tagged_decisions view...');
  const decisions = db.prepare('SELECT * FROM tagged_decisions LIMIT 1').all();
  console.log('View query successful (found', decisions.length, 'rows)');

  // Test 5: Check standard data
  console.log('\n[Test 5] Verifying standard data...');
  const layers = db.prepare('SELECT name FROM layers ORDER BY name').all();
  console.log('Layers:', layers.map(l => l.name).join(', '));

  const categories = db.prepare('SELECT name FROM constraint_categories ORDER BY name').all();
  console.log('Categories:', categories.map(c => c.name).join(', '));

  const tags = db.prepare('SELECT name FROM tags ORDER BY name').all();
  console.log('Tags:', tags.map(t => t.name).join(', '));

  // Close database
  console.log('\n[Test 6] Closing database...');
  closeDatabase();

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests passed successfully!');
  console.log('='.repeat(60));

} catch (error) {
  console.error('\n✗ Test failed:', error.message);
  process.exit(1);
}
