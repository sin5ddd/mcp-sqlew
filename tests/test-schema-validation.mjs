#!/usr/bin/env node

/**
 * Test script to verify schema validation
 * Creates a database with invalid schema and tests error handling
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { spawn } from 'child_process';

const TEST_DB_PATH = './.sqlew-test/test.db';
const TEST_DIR = './.sqlew-test';

console.log('🧪 Testing Schema Validation Feature\n');

// Clean up test directory if exists
if (existsSync(TEST_DIR)) {
  rmSync(TEST_DIR, { recursive: true, force: true });
  console.log('✓ Cleaned up existing test directory');
}

// Create test directory
mkdirSync(TEST_DIR, { recursive: true });
console.log('✓ Created test directory');

// Test 1: Create database with incomplete schema
console.log('\n📋 Test 1: Invalid schema (missing tables)');
const db = new Database(TEST_DB_PATH);
db.pragma('foreign_keys = ON');

// Create only a subset of required tables (invalid schema)
db.exec(`
  CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    ts INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    ts INTEGER DEFAULT (unixepoch())
  );
`);

console.log('✓ Created database with incomplete schema (only 2 tables)');
db.close();

// Test 2: Try to initialize with invalid schema
console.log('\n📋 Test 2: Attempting to start MCP server with invalid schema...\n');

const child = spawn('node', ['dist/index.js', TEST_DB_PATH], {
  stdio: 'pipe'
});

let output = '';
let errorOutput = '';

child.stdout.on('data', (data) => {
  output += data.toString();
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  errorOutput += data.toString();
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log(`\n📊 Process exited with code: ${code}`);

  if (code === 1 && errorOutput.includes('schema validation failed')) {
    console.log('\n✅ SUCCESS: Schema validation correctly detected invalid database!');
    console.log('✓ Error message displayed correctly');
    console.log('✓ Process exited with code 1');
  } else {
    console.log('\n❌ FAILED: Schema validation did not work as expected');
    console.log(`Exit code: ${code}`);
  }

  // Clean up
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
    console.log('\n✓ Cleaned up test directory');
  }

  console.log('\n🏁 Test completed\n');
  process.exit(code === 1 ? 0 : 1);
});
