#!/usr/bin/env node
/**
 * Test suite for Phase 3: Metadata Features
 * Tests search_by_tags, get_versions, and search_by_layer tools
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { dirname } from 'path';

// Test database path
const TEST_DB_PATH = './.sqlew-test-phase3/test.db';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

/**
 * Print test result
 */
function printResult(testName, passed, message = '') {
  if (passed) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    if (message) {
      console.log(`  ${RED}Error: ${message}${RESET}`);
    }
    testsFailed++;
  }
}

/**
 * Print section header
 */
function printSection(title) {
  console.log(`\n${BLUE}=== ${title} ===${RESET}`);
}

/**
 * Initialize test database with schema
 */
function initTestDatabase() {
  // Clean up existing test database
  if (existsSync(dirname(TEST_DB_PATH))) {
    rmSync(dirname(TEST_DB_PATH), { recursive: true, force: true });
  }

  // Create directory
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });

  // Create database
  const db = new Database(TEST_DB_PATH);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create schema (simplified version for testing)
  db.exec(`
    -- Master tables
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE context_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE
    );

    CREATE TABLE layers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    -- Transaction tables
    CREATE TABLE decisions (
      key_id INTEGER PRIMARY KEY,
      value TEXT NOT NULL,
      agent_id INTEGER,
      layer_id INTEGER,
      version TEXT NOT NULL DEFAULT '1.0.0',
      status INTEGER NOT NULL DEFAULT 1,
      ts INTEGER NOT NULL,
      FOREIGN KEY (key_id) REFERENCES context_keys(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (layer_id) REFERENCES layers(id)
    );

    CREATE TABLE decisions_numeric (
      key_id INTEGER PRIMARY KEY,
      value REAL NOT NULL,
      agent_id INTEGER,
      layer_id INTEGER,
      version TEXT NOT NULL DEFAULT '1.0.0',
      status INTEGER NOT NULL DEFAULT 1,
      ts INTEGER NOT NULL,
      FOREIGN KEY (key_id) REFERENCES context_keys(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (layer_id) REFERENCES layers(id)
    );

    CREATE TABLE decision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      value TEXT NOT NULL,
      agent_id INTEGER,
      ts INTEGER NOT NULL,
      FOREIGN KEY (key_id) REFERENCES context_keys(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE decision_tags (
      decision_key_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (decision_key_id, tag_id),
      FOREIGN KEY (decision_key_id) REFERENCES context_keys(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE decision_scopes (
      decision_key_id INTEGER NOT NULL,
      scope_id INTEGER NOT NULL,
      PRIMARY KEY (decision_key_id, scope_id),
      FOREIGN KEY (decision_key_id) REFERENCES context_keys(id),
      FOREIGN KEY (scope_id) REFERENCES scopes(id)
    );

    -- Insert standard layers
    INSERT INTO layers (name) VALUES
      ('presentation'),
      ('business'),
      ('data'),
      ('infrastructure'),
      ('cross-cutting');

    -- Create tagged_decisions view
    CREATE VIEW tagged_decisions AS
    SELECT
      ck.key,
      COALESCE(d.value, CAST(dn.value AS TEXT)) as value,
      COALESCE(d.version, dn.version) as version,
      CASE COALESCE(d.status, dn.status)
        WHEN 1 THEN 'active'
        WHEN 2 THEN 'deprecated'
        WHEN 3 THEN 'draft'
      END as status,
      l.name as layer,
      (SELECT GROUP_CONCAT(t.name, ',')
       FROM decision_tags dt
       INNER JOIN tags t ON dt.tag_id = t.id
       WHERE dt.decision_key_id = ck.id) as tags,
      (SELECT GROUP_CONCAT(s.name, ',')
       FROM decision_scopes ds
       INNER JOIN scopes s ON ds.scope_id = s.id
       WHERE ds.decision_key_id = ck.id) as scopes,
      a.name as decided_by,
      datetime(COALESCE(d.ts, dn.ts), 'unixepoch') as updated
    FROM context_keys ck
    LEFT JOIN decisions d ON ck.id = d.key_id
    LEFT JOIN decisions_numeric dn ON ck.id = dn.key_id
    LEFT JOIN layers l ON COALESCE(d.layer_id, dn.layer_id) = l.id
    LEFT JOIN agents a ON COALESCE(d.agent_id, dn.agent_id) = a.id
    WHERE d.key_id IS NOT NULL OR dn.key_id IS NOT NULL;
  `);

  return db;
}

/**
 * Helper: Insert agent
 */
function insertAgent(db, name) {
  db.prepare('INSERT OR IGNORE INTO agents (name) VALUES (?)').run(name);
  return db.prepare('SELECT id FROM agents WHERE name = ?').get(name).id;
}

/**
 * Helper: Insert context key
 */
function insertContextKey(db, key) {
  db.prepare('INSERT OR IGNORE INTO context_keys (key) VALUES (?)').run(key);
  return db.prepare('SELECT id FROM context_keys WHERE key = ?').get(key).id;
}

/**
 * Helper: Insert tag
 */
function insertTag(db, name) {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
  return db.prepare('SELECT id FROM tags WHERE name = ?').get(name).id;
}

/**
 * Helper: Get layer ID
 */
function getLayerId(db, name) {
  const result = db.prepare('SELECT id FROM layers WHERE name = ?').get(name);
  return result ? result.id : null;
}

/**
 * Helper: Insert decision with metadata
 */
function insertDecision(db, key, value, options = {}) {
  const agentId = options.agent ? insertAgent(db, options.agent) : null;
  const keyId = insertContextKey(db, key);
  const layerId = options.layer ? getLayerId(db, options.layer) : null;
  const version = options.version || '1.0.0';
  const status = options.status || 1; // 1=active
  const ts = options.ts || Math.floor(Date.now() / 1000);

  // Insert decision
  if (typeof value === 'number') {
    db.prepare(`
      INSERT INTO decisions_numeric (key_id, value, agent_id, layer_id, version, status, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(keyId, value, agentId, layerId, version, status, ts);
  } else {
    db.prepare(`
      INSERT INTO decisions (key_id, value, agent_id, layer_id, version, status, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(keyId, value, agentId, layerId, version, status, ts);
  }

  // Insert tags
  if (options.tags && options.tags.length > 0) {
    for (const tagName of options.tags) {
      const tagId = insertTag(db, tagName);
      db.prepare('INSERT INTO decision_tags (decision_key_id, tag_id) VALUES (?, ?)').run(keyId, tagId);
    }
  }

  return keyId;
}

/**
 * Helper: Insert version history
 */
function insertVersionHistory(db, key, version, value, agent, ts) {
  const keyId = insertContextKey(db, key);
  const agentId = agent ? insertAgent(db, agent) : null;

  db.prepare(`
    INSERT INTO decision_history (key_id, version, value, agent_id, ts)
    VALUES (?, ?, ?, ?, ?)
  `).run(keyId, version, value, agentId, ts);
}

/**
 * Test: search_by_tags with OR logic
 */
function testSearchByTagsOR(db) {
  printSection('Test: search_by_tags with OR logic');

  // Insert test data
  insertDecision(db, 'auth_method', 'jwt', {
    tags: ['authentication', 'security'],
    layer: 'business',
    agent: 'agent1'
  });

  insertDecision(db, 'cache_ttl', 300, {
    tags: ['performance', 'caching'],
    layer: 'infrastructure',
    agent: 'agent2'
  });

  insertDecision(db, 'api_key', 'secret123', {
    tags: ['security', 'api'],
    layer: 'presentation',
    agent: 'agent3'
  });

  // Query with OR logic (any tag matches)
  const query = `
    SELECT * FROM tagged_decisions
    WHERE (tags LIKE ? OR tags = ?) OR (tags LIKE ? OR tags = ?)
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('%security%', 'security', '%authentication%', 'authentication');

  printResult('Should find decisions with security OR authentication tags', results.length === 2);
  printResult('Should include auth_method decision', results.some(r => r.key === 'auth_method'));
  printResult('Should include api_key decision', results.some(r => r.key === 'api_key'));
  printResult('Should NOT include cache_ttl decision', !results.some(r => r.key === 'cache_ttl'));
}

/**
 * Test: search_by_tags with AND logic
 */
function testSearchByTagsAND(db) {
  printSection('Test: search_by_tags with AND logic');

  // Query with AND logic (all tags must match)
  const query = `
    SELECT * FROM tagged_decisions
    WHERE (tags LIKE ? OR tags = ?) AND (tags LIKE ? OR tags = ?)
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('%authentication%', 'authentication', '%security%', 'security');

  printResult('Should find only decisions with BOTH authentication AND security tags', results.length === 1);
  printResult('Should include auth_method decision', results.some(r => r.key === 'auth_method'));
  printResult('Should NOT include api_key (only security tag)', !results.some(r => r.key === 'api_key'));
}

/**
 * Test: search_by_tags with layer filter
 */
function testSearchByTagsWithLayer(db) {
  printSection('Test: search_by_tags with layer filter');

  // Query with tag + layer filter
  const query = `
    SELECT * FROM tagged_decisions
    WHERE (tags LIKE ? OR tags = ?) AND layer = ?
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('%security%', 'security', 'presentation');

  printResult('Should find decisions with security tag in presentation layer', results.length === 1);
  printResult('Should include api_key decision', results.some(r => r.key === 'api_key'));
  printResult('Should NOT include auth_method (business layer)', !results.some(r => r.key === 'auth_method'));
}

/**
 * Test: search_by_tags with status filter
 */
function testSearchByTagsWithStatus(db) {
  printSection('Test: search_by_tags with status filter');

  // Add a deprecated decision
  insertDecision(db, 'old_auth', 'basic', {
    tags: ['authentication', 'deprecated'],
    status: 2, // deprecated
    agent: 'agent1'
  });

  // Query active decisions only
  const query = `
    SELECT * FROM tagged_decisions
    WHERE (tags LIKE ? OR tags = ?) AND status = ?
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('%authentication%', 'authentication', 'active');

  printResult('Should find only active decisions with authentication tag', results.length === 1);
  printResult('Should include auth_method decision', results.some(r => r.key === 'auth_method'));
  printResult('Should NOT include old_auth (deprecated)', !results.some(r => r.key === 'old_auth'));
}

/**
 * Test: get_versions with history
 */
function testGetVersionsWithHistory(db) {
  printSection('Test: get_versions with history');

  const key = 'config_timeout';
  const now = Math.floor(Date.now() / 1000);

  // Insert current version
  insertDecision(db, key, 5000, { version: '3.0.0', agent: 'agent3', ts: now });

  // Insert version history
  insertVersionHistory(db, key, '1.0.0', '1000', 'agent1', now - 200);
  insertVersionHistory(db, key, '2.0.0', '3000', 'agent2', now - 100);

  // Query version history
  const query = `
    SELECT
      dh.version,
      dh.value,
      a.name as agent_name,
      datetime(dh.ts, 'unixepoch') as timestamp
    FROM decision_history dh
    LEFT JOIN agents a ON dh.agent_id = a.id
    INNER JOIN context_keys ck ON dh.key_id = ck.id
    WHERE ck.key = ?
    ORDER BY dh.ts DESC
  `;

  const history = db.prepare(query).all(key);

  printResult('Should return 2 historical versions', history.length === 2);
  printResult('Should order by timestamp DESC', history[0].version === '2.0.0' && history[1].version === '1.0.0');
  printResult('Should include agent names', history[0].agent_name === 'agent2' && history[1].agent_name === 'agent1');
  printResult('Should include timestamps', history[0].timestamp && history[1].timestamp);
}

/**
 * Test: get_versions without history
 */
function testGetVersionsWithoutHistory(db) {
  printSection('Test: get_versions without history');

  const key = 'new_setting';

  // Insert decision without history
  insertDecision(db, key, 'value1', { version: '1.0.0', agent: 'agent1' });

  // Query version history
  const query = `
    SELECT
      dh.version,
      dh.value,
      a.name as agent_name,
      datetime(dh.ts, 'unixepoch') as timestamp
    FROM decision_history dh
    LEFT JOIN agents a ON dh.agent_id = a.id
    INNER JOIN context_keys ck ON dh.key_id = ck.id
    WHERE ck.key = ?
    ORDER BY dh.ts DESC
  `;

  const history = db.prepare(query).all(key);

  printResult('Should return empty array for decision without history', history.length === 0);
}

/**
 * Test: get_versions for non-existent key
 */
function testGetVersionsNonExistent(db) {
  printSection('Test: get_versions for non-existent key');

  const key = 'non_existent_key';

  // Check if key exists
  const keyExists = db.prepare('SELECT id FROM context_keys WHERE key = ?').get(key);

  printResult('Should return null for non-existent key', !keyExists);
}

/**
 * Test: search_by_layer for each layer
 */
function testSearchByLayerEachLayer(db) {
  printSection('Test: search_by_layer for each layer');

  // Query decisions by layer
  const presentationDecisions = db.prepare('SELECT * FROM tagged_decisions WHERE layer = ?').all('presentation');
  const businessDecisions = db.prepare('SELECT * FROM tagged_decisions WHERE layer = ?').all('business');
  const infrastructureDecisions = db.prepare('SELECT * FROM tagged_decisions WHERE layer = ?').all('infrastructure');

  printResult('Should find 1 decision in presentation layer', presentationDecisions.length === 1);
  printResult('Should find 2 decisions in business layer', businessDecisions.length === 2);
  printResult('Should find 1 decision in infrastructure layer', infrastructureDecisions.length === 1);
}

/**
 * Test: search_by_layer with status filter
 */
function testSearchByLayerWithStatus(db) {
  printSection('Test: search_by_layer with status filter');

  // Query active decisions in business layer
  const query = `
    SELECT * FROM tagged_decisions
    WHERE layer = ? AND status = ?
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('business', 'active');

  printResult('Should find active decisions in business layer', results.length === 1);
  printResult('Should include auth_method decision', results.some(r => r.key === 'auth_method'));
  printResult('Should NOT include old_auth (deprecated)', !results.some(r => r.key === 'old_auth'));
}

/**
 * Test: search_by_layer with include_tags=false
 */
function testSearchByLayerWithoutTags(db) {
  printSection('Test: search_by_layer with include_tags=false');

  // Query without tags (using base decisions table)
  const query = `
    SELECT
      ck.key,
      d.value,
      d.version,
      CASE d.status
        WHEN 1 THEN 'active'
        WHEN 2 THEN 'deprecated'
        WHEN 3 THEN 'draft'
      END as status,
      l.name as layer,
      NULL as tags,
      NULL as scopes,
      a.name as decided_by,
      datetime(d.ts, 'unixepoch') as updated
    FROM decisions d
    INNER JOIN context_keys ck ON d.key_id = ck.id
    LEFT JOIN layers l ON d.layer_id = l.id
    LEFT JOIN agents a ON d.agent_id = a.id
    WHERE l.name = ?
  `;

  const results = db.prepare(query).all('presentation');

  printResult('Should find decisions without tags field', results.length === 1);
  printResult('Should have null tags field', results[0].tags === null);
}

/**
 * Test: Combined filters (layer + tags + status)
 */
function testCombinedFilters(db) {
  printSection('Test: Combined filters (layer + tags + status)');

  // Query with multiple filters
  const query = `
    SELECT * FROM tagged_decisions
    WHERE layer = ?
    AND (tags LIKE ? OR tags = ?)
    AND status = ?
    ORDER BY updated DESC
  `;

  const results = db.prepare(query).all('business', '%security%', 'security', 'active');

  printResult('Should apply all filters correctly', results.length === 1);
  printResult('Should include auth_method decision', results.some(r => r.key === 'auth_method'));
}

/**
 * Test: Invalid layer name
 */
function testInvalidLayer(db) {
  printSection('Test: Invalid layer name');

  const layerId = getLayerId(db, 'invalid_layer');

  printResult('Should return null for invalid layer', layerId === null);
}

/**
 * Test: Empty tags array
 */
function testEmptyTagsArray(db) {
  printSection('Test: Empty tags array');

  // This should be validated in the tool implementation
  // Here we just verify the data structure supports it
  const results = db.prepare('SELECT * FROM tagged_decisions WHERE tags IS NULL').all();

  printResult('Should support decisions without tags', results.length >= 1);
}

/**
 * Main test runner
 */
function runTests() {
  console.log(`${YELLOW}Phase 3 Metadata Features Test Suite${RESET}`);
  console.log(`${YELLOW}=====================================${RESET}`);

  let db;

  try {
    // Initialize test database
    printSection('Initializing test database');
    db = initTestDatabase();
    console.log(`${GREEN}✓${RESET} Test database initialized`);

    // Run all tests
    testSearchByTagsOR(db);
    testSearchByTagsAND(db);
    testSearchByTagsWithLayer(db);
    testSearchByTagsWithStatus(db);
    testGetVersionsWithHistory(db);
    testGetVersionsWithoutHistory(db);
    testGetVersionsNonExistent(db);
    testSearchByLayerEachLayer(db);
    testSearchByLayerWithStatus(db);
    testSearchByLayerWithoutTags(db);
    testCombinedFilters(db);
    testInvalidLayer(db);
    testEmptyTagsArray(db);

    // Print summary
    console.log(`\n${BLUE}=== Test Summary ===${RESET}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);
    console.log(`${YELLOW}Total:  ${testsPassed + testsFailed}${RESET}`);

    // Exit with appropriate code
    process.exit(testsFailed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`${RED}Fatal error:${RESET}`, error);
    process.exit(1);
  } finally {
    // Clean up
    if (db) {
      db.close();
    }

    // Remove test database
    if (existsSync(dirname(TEST_DB_PATH))) {
      rmSync(dirname(TEST_DB_PATH), { recursive: true, force: true });
    }
  }
}

// Run tests
runTests();
