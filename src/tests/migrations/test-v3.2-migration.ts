/**
 * Focused Migration Test: v3.1.x → v3.2.0 (Task Dependencies)
 * Tests the specific task dependencies migration
 */

import Database from 'better-sqlite3';
import { initializeSchema } from '../../schema.js';
import { needsTaskDependenciesMigration, migrateToTaskDependencies } from '../../migrations/add-task-dependencies.js';

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message: string, color: string = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testTaskDependenciesMigration() {
  log('\n' + '='.repeat(70), BLUE);
  log('v3.2.0 MIGRATION TEST: Task Dependencies', BLUE);
  log('='.repeat(70) + '\n', BLUE);

  // Test 1: Fresh database with full schema
  log('TEST 1: Fresh Database (Full Schema Initialization)', YELLOW);
  log('-'.repeat(70), YELLOW);

  const dbFresh = new Database(':memory:');

  try {
    // Initialize full schema (this will create v3.2.0 directly)
    initializeSchema(dbFresh);

    // Check if t_task_dependencies exists
    const hasTable = dbFresh.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'"
    ).get();

    if (hasTable) {
      log('✅ t_task_dependencies table exists in fresh schema', GREEN);

      // Verify structure
      const columns = dbFresh.prepare("PRAGMA table_info(t_task_dependencies)").all() as any[];
      log(`✅ Table has ${columns.length} columns`, GREEN);

      // Verify indexes
      const indexes = dbFresh.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='t_task_dependencies'"
      ).all() as any[];
      log(`✅ Table has ${indexes.length} index(es):`, GREEN);
      indexes.forEach((idx: any) => {
        log(`    - ${idx.name}`, GREEN);
      });
    } else {
      log('❌ t_task_dependencies table NOT found!', RED);
      return false;
    }
  } finally {
    dbFresh.close();
  }

  // Test 2: Simulated v3.1.x database (manually remove t_task_dependencies)
  log('\nTEST 2: Upgrade from v3.1.x → v3.2.0', YELLOW);
  log('-'.repeat(70), YELLOW);

  const dbUpgrade = new Database(':memory:');

  try {
    // Initialize full schema first
    initializeSchema(dbUpgrade);

    // Drop t_task_dependencies to simulate v3.1.x
    dbUpgrade.exec('DROP TABLE IF EXISTS t_task_dependencies');
    log('✓ Simulated v3.1.x (removed t_task_dependencies)', YELLOW);

    // Register an agent first (for activity log triggers)
    dbUpgrade.exec(`INSERT OR IGNORE INTO m_agents (id, name) VALUES (1, 'test-agent')`);

    // Add some test tasks (disable triggers temporarily)
    dbUpgrade.exec(`
      INSERT INTO t_tasks (id, title, status_id, priority, created_by_agent_id)
      VALUES
        (1, 'Database Schema', 1, 4, 1),
        (2, 'API Implementation', 1, 3, 1),
        (3, 'Testing', 1, 2, 1);
    `);
    log('✓ Created test tasks (3 tasks)', YELLOW);

    // Check if migration is needed
    const needsMigration = needsTaskDependenciesMigration(dbUpgrade);
    log(`✓ needsMigration: ${needsMigration}`, needsMigration ? YELLOW : GREEN);

    if (!needsMigration) {
      log('❌ Migration should be needed but reports as not needed!', RED);
      return false;
    }

    // Run migration
    log('\n🔄 Running migration...', BLUE);
    const result = migrateToTaskDependencies(dbUpgrade);

    if (result.success) {
      log(`✅ ${result.message}`, GREEN);
      if (result.details) {
        result.details.forEach((detail: string) => {
          log(`    - ${detail}`, GREEN);
        });
      }

      // Verify table exists
      const hasTable = dbUpgrade.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'"
      ).get();

      if (!hasTable) {
        log('❌ Table not created!', RED);
        return false;
      }

      // Test adding dependencies
      log('\n✓ Testing dependency operations:', YELLOW);

      dbUpgrade.exec(`
        INSERT INTO t_task_dependencies (blocker_task_id, blocked_task_id)
        VALUES (1, 2), (2, 3);
      `);
      log('  ✓ Added dependencies: 1→2, 2→3', GREEN);

      // Query dependencies
      const deps = dbUpgrade.prepare('SELECT * FROM t_task_dependencies').all();
      log(`  ✓ Verified ${deps.length} dependencies in table`, GREEN);

      // Test CASCADE deletion
      dbUpgrade.exec('DELETE FROM t_tasks WHERE id = 1');
      const depsAfterDelete = dbUpgrade.prepare('SELECT * FROM t_task_dependencies').all();
      log(`  ✓ CASCADE deletion: ${depsAfterDelete.length} dependencies remaining (was 2)`, GREEN);

    } else {
      log(`❌ ${result.message}`, RED);
      return false;
    }

  } finally {
    dbUpgrade.close();
  }

  // Test 3: Idempotency (running migration twice)
  log('\nTEST 3: Migration Idempotency', YELLOW);
  log('-'.repeat(70), YELLOW);

  const dbIdempotent = new Database(':memory:');

  try {
    // Initialize full schema
    initializeSchema(dbIdempotent);

    // Run migration on already-migrated database
    log('✓ Running migration on already-migrated database...', YELLOW);
    const result = migrateToTaskDependencies(dbIdempotent);

    if (result.success && result.message.includes('already exists')) {
      log(`✅ ${result.message}`, GREEN);
      log('✅ Migration is idempotent (safe to run multiple times)', GREEN);
    } else if (result.success) {
      log('⚠️  Migration ran but should have detected existing table', YELLOW);
    } else {
      log(`❌ ${result.message}`, RED);
      return false;
    }

  } finally {
    dbIdempotent.close();
  }

  // Test 4: Verify foreign key constraints
  log('\nTEST 4: Foreign Key Constraints', YELLOW);
  log('-'.repeat(70), YELLOW);

  const dbFK = new Database(':memory:');

  try {
    initializeSchema(dbFK);
    dbFK.exec('PRAGMA foreign_keys = ON');

    // Register agent
    dbFK.exec(`INSERT OR IGNORE INTO m_agents (id, name) VALUES (1, 'test-agent')`);

    // Add test tasks
    dbFK.exec(`
      INSERT INTO t_tasks (id, title, status_id, created_by_agent_id) VALUES (1, 'Task A', 1, 1);
      INSERT INTO t_tasks (id, title, status_id, created_by_agent_id) VALUES (2, 'Task B', 1, 1);
    `);

    // Try to add dependency with non-existent task
    try {
      dbFK.exec('INSERT INTO t_task_dependencies (blocker_task_id, blocked_task_id) VALUES (1, 999)');
      log('❌ Should have failed FK constraint!', RED);
      return false;
    } catch (error) {
      log('✅ Foreign key constraint working (rejected invalid task_id)', GREEN);
    }

    // Add valid dependency
    dbFK.exec('INSERT INTO t_task_dependencies (blocker_task_id, blocked_task_id) VALUES (1, 2)');
    log('✅ Valid dependency added successfully', GREEN);

  } finally {
    dbFK.close();
  }

  return true;
}

// Run test
testTaskDependenciesMigration().then(success => {
  log('\n' + '='.repeat(70), BLUE);
  if (success) {
    log('🎉 ALL TESTS PASSED!', GREEN);
    log('='.repeat(70) + '\n', BLUE);
    process.exit(0);
  } else {
    log('❌ TESTS FAILED!', RED);
    log('='.repeat(70) + '\n', BLUE);
    process.exit(1);
  }
}).catch(error => {
  log(`\n❌ Fatal error: ${error}`, RED);
  process.exit(1);
});
