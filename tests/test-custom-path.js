#!/usr/bin/env node
/**
 * Test custom database path
 */

import { initializeDatabase, closeDatabase } from './dist/database.js';

console.log('Testing custom database path...');

try {
  // Test with absolute path
  const customPath = '/tmp/test-mcp-context.db';
  console.log(`\nInitializing with custom path: ${customPath}`);
  const db = initializeDatabase(customPath);

  // Verify it works
  const layers = db.prepare('SELECT COUNT(*) as count FROM layers').get();
  console.log(`✓ Database initialized at custom path (${layers.count} layers found)`);

  closeDatabase();

  // Test with relative path
  const relativePath = '.test-db/context.db';
  console.log(`\nInitializing with relative path: ${relativePath}`);
  const db2 = initializeDatabase(relativePath);

  const tags = db2.prepare('SELECT COUNT(*) as count FROM tags').get();
  console.log(`✓ Database initialized at relative path (${tags.count} tags found)`);

  closeDatabase();

  console.log('\n✓ All custom path tests passed!');

} catch (error) {
  console.error('✗ Test failed:', error.message);
  process.exit(1);
}
