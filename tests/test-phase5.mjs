#!/usr/bin/env node
/**
 * Phase 5 Test Suite: File Change Tracking with Layer Integration
 * Tests record_file_change, get_file_changes, and check_file_lock tools
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path
const TEST_DB_DIR = join(__dirname, '.sqlew-test');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-phase5.db');

// Test results tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

/**
 * Test assertion helper
 */
function assert(condition, testName, message = '') {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${testName}`);
    return true;
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${testName}`);
    if (message) {
      console.log(`  ${RED}${message}${RESET}`);
    }
    return false;
  }
}

/**
 * Initialize test database with schema
 */
function initTestDatabase() {
  // Create test directory
  if (!existsSync(TEST_DB_DIR)) {
    mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  // Remove existing test database
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema (simplified version for testing)
  db.exec(`
    -- Master tables
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL
    );

    CREATE TABLE layers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    -- Transaction tables
    CREATE TABLE file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id),
      agent_id INTEGER NOT NULL REFERENCES agents(id),
      layer_id INTEGER REFERENCES layers(id),
      change_type INTEGER NOT NULL,
      description TEXT,
      ts INTEGER DEFAULT (unixepoch())
    );

    -- Indexes
    CREATE INDEX idx_file_changes_ts ON file_changes(ts DESC);
    CREATE INDEX idx_file_changes_file ON file_changes(file_id);
    CREATE INDEX idx_file_changes_layer ON file_changes(layer_id);

    -- View
    CREATE VIEW recent_file_changes AS
    SELECT
      f.path,
      a.name as changed_by,
      l.name as layer,
      CASE fc.change_type
        WHEN 1 THEN 'created'
        WHEN 2 THEN 'modified'
        ELSE 'deleted'
      END as change_type,
      fc.description,
      datetime(fc.ts, 'unixepoch') as changed_at
    FROM file_changes fc
    JOIN files f ON fc.file_id = f.id
    JOIN agents a ON fc.agent_id = a.id
    LEFT JOIN layers l ON fc.layer_id = l.id
    WHERE fc.ts > unixepoch() - 3600
    ORDER BY fc.ts DESC;

    -- Initial data
    INSERT INTO layers (name) VALUES
      ('presentation'),
      ('business'),
      ('data'),
      ('infrastructure'),
      ('cross-cutting');

    -- Auto-cleanup trigger (7 days)
    CREATE TRIGGER cleanup_old_file_changes
    AFTER INSERT ON file_changes
    BEGIN
      DELETE FROM file_changes
      WHERE ts < unixepoch() - 604800;
    END;
  `);

  return db;
}

/**
 * Helper: Get or create agent
 */
function getOrCreateAgent(db, name) {
  db.prepare('INSERT OR IGNORE INTO agents (name) VALUES (?)').run(name);
  const result = db.prepare('SELECT id FROM agents WHERE name = ?').get(name);
  return result.id;
}

/**
 * Helper: Get or create file
 */
function getOrCreateFile(db, path) {
  db.prepare('INSERT OR IGNORE INTO files (path) VALUES (?)').run(path);
  const result = db.prepare('SELECT id FROM files WHERE path = ?').get(path);
  return result.id;
}

/**
 * Helper: Get layer ID
 */
function getLayerId(db, name) {
  const result = db.prepare('SELECT id FROM layers WHERE name = ?').get(name);
  return result ? result.id : null;
}

/**
 * Test Suite
 */
function runTests() {
  console.log(`\n${CYAN}=== Phase 5: File Change Tracking Tests ===${RESET}\n`);

  const db = initTestDatabase();

  // ========================================================================
  // Test 1: record_file_change - Basic created change
  // ========================================================================
  {
    const fileId = getOrCreateFile(db, 'src/index.ts');
    const agentId = getOrCreateAgent(db, 'agent1');

    const stmt = db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(fileId, agentId, 1); // 1 = created

    const change = db.prepare('SELECT * FROM file_changes WHERE id = ?').get(result.lastInsertRowid);

    assert(
      change && change.change_type === 1,
      'Test 1: record_file_change - Basic created change',
      change ? '' : 'Failed to insert file change'
    );
  }

  // ========================================================================
  // Test 2: record_file_change - Modified with layer
  // ========================================================================
  {
    const fileId = getOrCreateFile(db, 'src/database.ts');
    const agentId = getOrCreateAgent(db, 'agent2');
    const layerId = getLayerId(db, 'data');

    const stmt = db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, layer_id, change_type)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(fileId, agentId, layerId, 2); // 2 = modified

    const change = db.prepare(`
      SELECT fc.*, l.name as layer_name
      FROM file_changes fc
      LEFT JOIN layers l ON fc.layer_id = l.id
      WHERE fc.id = ?
    `).get(result.lastInsertRowid);

    assert(
      change && change.change_type === 2 && change.layer_name === 'data',
      'Test 2: record_file_change - Modified with layer assignment',
      change ? `Expected layer 'data', got '${change.layer_name}'` : 'Failed to insert'
    );
  }

  // ========================================================================
  // Test 3: record_file_change - Deleted with description
  // ========================================================================
  {
    const fileId = getOrCreateFile(db, 'src/old-code.ts');
    const agentId = getOrCreateAgent(db, 'agent3');

    const stmt = db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, description)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(fileId, agentId, 3, 'Removed deprecated code'); // 3 = deleted

    const change = db.prepare('SELECT * FROM file_changes WHERE id = ?').get(result.lastInsertRowid);

    assert(
      change && change.change_type === 3 && change.description === 'Removed deprecated code',
      'Test 3: record_file_change - Deleted with description',
      change ? '' : 'Failed to insert'
    );
  }

  // ========================================================================
  // Test 4: get_file_changes - Filter by specific file
  // ========================================================================
  {
    const changes = db.prepare(`
      SELECT
        f.path,
        a.name as changed_by,
        CASE fc.change_type
          WHEN 1 THEN 'created'
          WHEN 2 THEN 'modified'
          ELSE 'deleted'
        END as change_type
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      JOIN agents a ON fc.agent_id = a.id
      WHERE f.path = ?
      ORDER BY fc.ts DESC
    `).all('src/index.ts');

    assert(
      changes.length === 1 && changes[0].path === 'src/index.ts',
      'Test 4: get_file_changes - Filter by specific file',
      `Expected 1 change for 'src/index.ts', got ${changes.length}`
    );
  }

  // ========================================================================
  // Test 5: get_file_changes - Filter by agent
  // ========================================================================
  {
    const changes = db.prepare(`
      SELECT
        f.path,
        a.name as changed_by
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      JOIN agents a ON fc.agent_id = a.id
      WHERE a.name = ?
      ORDER BY fc.ts DESC
    `).all('agent2');

    assert(
      changes.length === 1 && changes[0].changed_by === 'agent2',
      'Test 5: get_file_changes - Filter by agent',
      `Expected 1 change by 'agent2', got ${changes.length}`
    );
  }

  // ========================================================================
  // Test 6: get_file_changes - Filter by layer
  // ========================================================================
  {
    const changes = db.prepare(`
      SELECT
        f.path,
        l.name as layer
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      LEFT JOIN layers l ON fc.layer_id = l.id
      WHERE l.name = ?
      ORDER BY fc.ts DESC
    `).all('data');

    assert(
      changes.length === 1 && changes[0].layer === 'data',
      'Test 6: get_file_changes - Filter by layer',
      `Expected 1 change in 'data' layer, got ${changes.length}`
    );
  }

  // ========================================================================
  // Test 7: get_file_changes - Filter by change_type
  // ========================================================================
  {
    const changes = db.prepare(`
      SELECT
        CASE fc.change_type
          WHEN 1 THEN 'created'
          WHEN 2 THEN 'modified'
          ELSE 'deleted'
        END as change_type
      FROM file_changes fc
      WHERE fc.change_type = ?
    `).all(1); // 1 = created

    assert(
      changes.length === 1 && changes[0].change_type === 'created',
      'Test 7: get_file_changes - Filter by change_type',
      `Expected 1 'created' change, got ${changes.length}`
    );
  }

  // ========================================================================
  // Test 8: get_file_changes - Filter by since timestamp
  // ========================================================================
  {
    const currentTime = Math.floor(Date.now() / 1000);
    const oneHourAgo = currentTime - 3600;

    const changes = db.prepare(`
      SELECT COUNT(*) as count
      FROM file_changes
      WHERE ts >= ?
    `).get(oneHourAgo);

    assert(
      changes.count === 3,
      'Test 8: get_file_changes - Filter by since timestamp',
      `Expected 3 changes in last hour, got ${changes.count}`
    );
  }

  // ========================================================================
  // Test 9: get_file_changes - With limit
  // ========================================================================
  {
    const changes = db.prepare(`
      SELECT * FROM file_changes
      ORDER BY ts DESC
      LIMIT ?
    `).all(2);

    assert(
      changes.length === 2,
      'Test 9: get_file_changes - With limit',
      `Expected 2 changes, got ${changes.length}`
    );
  }

  // ========================================================================
  // Test 10: check_file_lock - File locked (within 5 min)
  // ========================================================================
  {
    // Insert a very recent change
    const fileId = getOrCreateFile(db, 'src/locked.ts');
    const agentId = getOrCreateAgent(db, 'locker-agent');

    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, ts)
      VALUES (?, ?, ?, ?)
    `).run(fileId, agentId, 2, Math.floor(Date.now() / 1000)); // Current time

    const lockDuration = 300; // 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const lockThreshold = currentTime - lockDuration;

    const result = db.prepare(`
      SELECT
        a.name as agent,
        fc.change_type,
        fc.ts
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      JOIN agents a ON fc.agent_id = a.id
      WHERE f.path = ?
      ORDER BY fc.ts DESC
      LIMIT 1
    `).get('src/locked.ts');

    const locked = result && result.ts >= lockThreshold;

    assert(
      locked === true && result.agent === 'locker-agent',
      'Test 10: check_file_lock - File locked (within 5 min)',
      locked ? '' : 'File should be locked but is not'
    );
  }

  // ========================================================================
  // Test 11: check_file_lock - File not locked (>5 min ago)
  // ========================================================================
  {
    const fileId = getOrCreateFile(db, 'src/old.ts');
    const agentId = getOrCreateAgent(db, 'old-agent');

    // Insert change 10 minutes ago
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, ts)
      VALUES (?, ?, ?, ?)
    `).run(fileId, agentId, 2, tenMinutesAgo);

    const lockDuration = 300; // 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const lockThreshold = currentTime - lockDuration;

    const result = db.prepare(`
      SELECT fc.ts
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      WHERE f.path = ?
      ORDER BY fc.ts DESC
      LIMIT 1
    `).get('src/old.ts');

    const locked = result && result.ts >= lockThreshold;

    assert(
      locked === false,
      'Test 11: check_file_lock - File not locked (>5 min ago)',
      !locked ? '' : 'File should not be locked but is'
    );
  }

  // ========================================================================
  // Test 12: check_file_lock - File never changed
  // ========================================================================
  {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      WHERE f.path = ?
    `).get('src/never-touched.ts');

    assert(
      result.count === 0,
      'Test 12: check_file_lock - File never changed',
      result.count === 0 ? '' : 'File should have no changes'
    );
  }

  // ========================================================================
  // Test 13: Auto-cleanup trigger (>7 days)
  // ========================================================================
  {
    const fileId = getOrCreateFile(db, 'src/ancient.ts');
    const agentId = getOrCreateAgent(db, 'ancient-agent');

    // Insert change 8 days ago
    const eightDaysAgo = Math.floor(Date.now() / 1000) - (8 * 86400);

    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, ts)
      VALUES (?, ?, ?, ?)
    `).run(fileId, agentId, 2, eightDaysAgo);

    // Trigger cleanup by inserting a new change
    const newFileId = getOrCreateFile(db, 'src/trigger.ts');
    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type)
      VALUES (?, ?, ?)
    `).run(newFileId, agentId, 1);

    // Check if old change was deleted
    const oldChange = db.prepare(`
      SELECT COUNT(*) as count
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      WHERE f.path = ? AND fc.ts < unixepoch() - 604800
    `).get('src/ancient.ts');

    assert(
      oldChange.count === 0,
      'Test 13: Auto-cleanup trigger - Old changes deleted',
      oldChange.count === 0 ? '' : 'Old changes should be deleted'
    );
  }

  // ========================================================================
  // Test 14: recent_file_changes view
  // ========================================================================
  {
    const changes = db.prepare('SELECT * FROM recent_file_changes').all();

    assert(
      changes.length > 0 && changes[0].hasOwnProperty('path'),
      'Test 14: recent_file_changes view - Returns data',
      `Expected changes from view, got ${changes.length} rows`
    );
  }

  // ========================================================================
  // Test 15: Integration test - Multiple agents editing same file
  // ========================================================================
  {
    const filePath = 'src/shared.ts';
    const fileId = getOrCreateFile(db, filePath);

    // Agent 1 creates file
    const agent1Id = getOrCreateAgent(db, 'creator-agent');
    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, layer_id)
      VALUES (?, ?, ?, ?)
    `).run(fileId, agent1Id, 1, getLayerId(db, 'business'));

    // Agent 2 modifies file
    const agent2Id = getOrCreateAgent(db, 'modifier-agent');
    db.prepare(`
      INSERT INTO file_changes (file_id, agent_id, change_type, layer_id)
      VALUES (?, ?, ?, ?)
    `).run(fileId, agent2Id, 2, getLayerId(db, 'business'));

    // Check history
    const history = db.prepare(`
      SELECT
        a.name as agent,
        CASE fc.change_type
          WHEN 1 THEN 'created'
          WHEN 2 THEN 'modified'
          ELSE 'deleted'
        END as change_type
      FROM file_changes fc
      JOIN files f ON fc.file_id = f.id
      JOIN agents a ON fc.agent_id = a.id
      WHERE f.path = ?
      ORDER BY fc.ts ASC
    `).all(filePath);

    assert(
      history.length === 2 &&
      history[0].agent === 'creator-agent' &&
      history[1].agent === 'modifier-agent',
      'Test 15: Integration - Multiple agents editing same file',
      `Expected 2 changes in order, got ${history.length}`
    );
  }

  // Close database
  db.close();

  // Cleanup
  rmSync(TEST_DB_DIR, { recursive: true });

  // Print summary
  console.log(`\n${CYAN}=== Test Summary ===${RESET}`);
  console.log(`Total: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);

  if (testsFailed === 0) {
    console.log(`\n${GREEN}✓ All Phase 5 tests passed!${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${RED}✗ Some tests failed${RESET}\n`);
    process.exit(1);
  }
}

// Run tests
runTests();
