/**
 * Migration Orchestrator
 *
 * Coordinates automatic sequential execution of all database migrations.
 * Supports upgrading from any previous version to the latest version in a single run.
 *
 * Features:
 * - Automatic version detection
 * - Migration chain construction
 * - Sequential execution with transaction safety
 * - Detailed logging and error reporting
 * - Dry-run mode support
 */

import { Database } from 'better-sqlite3';
import * as tablePrefixes from './add-table-prefixes.js';
import * as v210Features from './add-v2.1.0-features.js';
import * as taskTables from './add-task-tables.js';
import * as taskDependencies from './add-task-dependencies.js';
import * as decisionContext from './add-decision-context.js';
import * as prunedFiles from './add-v3.5.0-pruned-files.js';

export interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
}

export interface MigrationInfo {
  name: string;
  fromVersion: string;
  toVersion: string;
  needsMigration: (db: Database) => boolean;
  runMigration: (db: Database) => MigrationResult;
  getMigrationInfo: () => string;
}

/**
 * Registry of all available migrations in execution order
 */
const MIGRATIONS: MigrationInfo[] = [
  {
    name: 'add-table-prefixes',
    fromVersion: '1.0.x',
    toVersion: '1.1.0',
    needsMigration: tablePrefixes.needsMigration,
    runMigration: tablePrefixes.runMigration,
    getMigrationInfo: tablePrefixes.getMigrationInfo,
  },
  {
    name: 'add-v2.1.0-features',
    fromVersion: '2.0.0',
    toVersion: '2.1.0',
    needsMigration: v210Features.needsMigration,
    runMigration: v210Features.runMigration,
    getMigrationInfo: v210Features.getMigrationInfo,
  },
  {
    name: 'add-task-tables',
    fromVersion: '2.1.x',
    toVersion: '3.0.0',
    needsMigration: taskTables.needsMigration,
    runMigration: taskTables.runMigration,
    getMigrationInfo: taskTables.getMigrationInfo,
  },
  {
    name: 'add-task-dependencies',
    fromVersion: '3.1.x',
    toVersion: '3.2.0',
    needsMigration: taskDependencies.needsTaskDependenciesMigration,
    runMigration: taskDependencies.migrateToTaskDependencies,
    getMigrationInfo: taskDependencies.getTaskDependenciesMigrationInfo,
  },
  {
    name: 'add-decision-context',
    fromVersion: '3.2.0',
    toVersion: '3.2.2',
    needsMigration: decisionContext.needsDecisionContextMigration,
    runMigration: decisionContext.migrateToDecisionContext,
    getMigrationInfo: decisionContext.getDecisionContextMigrationInfo,
  },
  {
    name: 'add-v3.5.0-pruned-files',
    fromVersion: '3.4.x',
    toVersion: '3.5.0',
    needsMigration: prunedFiles.needsPrunedFilesMigration,
    runMigration: prunedFiles.migrateToPrunedFiles,
    getMigrationInfo: prunedFiles.getPrunedFilesMigrationInfo,
  },
];

/**
 * Detect current database version by inspecting schema
 *
 * Version Detection Logic:
 * - v1.0.0: Has unprefixed tables (agents, not m_agents)
 * - v1.1.0: Has prefixed tables but no t_activity_log
 * - v2.0.0: Has t_activity_log but no m_task_statuses
 * - v2.1.0: Has t_activity_log but no m_task_statuses
 * - v3.0.0: Has m_task_statuses but no t_task_dependencies
 * - v3.2.0: Has t_task_dependencies but no t_decision_context
 * - v3.2.2: Has t_decision_context but no t_task_pruned_files
 * - v3.5.0: Has t_task_pruned_files
 *
 * @param db - Database connection
 * @returns Detected version string
 */
export function detectDatabaseVersion(db: Database): string {
  try {
    // Check for pruned files table (v3.5.0)
    const hasPrunedFiles = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_pruned_files'"
    ).get();

    if (hasPrunedFiles) {
      return '3.5.0';
    }

    // Check for decision context table (v3.2.2)
    const hasDecisionContext = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_decision_context'"
    ).get();

    if (hasDecisionContext) {
      return '3.2.2';
    }

    // Check for task dependencies table (v3.2.0)
    const hasTaskDependencies = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'"
    ).get();

    if (hasTaskDependencies) {
      return '3.2.0';
    }

    // Check for task tables (v3.0.0)
    const hasTaskTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='m_task_statuses'"
    ).get();

    if (hasTaskTables) {
      return '3.1.x';
    }

    // Check for v2.1.0 features (activity log)
    const hasActivityLog = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_activity_log'"
    ).get();

    if (hasActivityLog) {
      return '2.1.x';
    }

    // Check for prefixed tables (v1.1.0+)
    const hasPrefixedTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='m_agents'"
    ).get();

    if (hasPrefixedTables) {
      return '2.0.0'; // Could be 1.1.0 or 2.0.0, both have same schema
    }

    // Check for old unprefixed tables (v1.0.0)
    const hasOldTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    ).get();

    if (hasOldTables) {
      return '1.0.0';
    }

    // No tables found - fresh database
    return 'fresh';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to detect database version: ${message}`);
  }
}

/**
 * Get migration plan for current database
 *
 * @param db - Database connection
 * @returns Array of migration names that need to run
 */
export function getMigrationPlan(db: Database): string[] {
  const plan: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.needsMigration(db)) {
      plan.push(`${migration.name} (${migration.fromVersion} → ${migration.toVersion})`);
    }
  }

  return plan;
}

/**
 * Run all pending migrations in sequence
 *
 * This function:
 * 1. Detects current database version
 * 2. Identifies which migrations are needed
 * 3. Executes migrations in correct order
 * 4. Stops on first failure (rollback already handled by individual migrations)
 * 5. Returns combined results
 *
 * @param db - Database connection
 * @param dryRun - If true, only show plan without executing (default: false)
 * @returns Array of migration results
 */
export function runAllMigrations(db: Database, dryRun: boolean = false): MigrationResult[] {
  const results: MigrationResult[] = [];

  try {
    // Detect current version
    const currentVersion = detectDatabaseVersion(db);
    console.log(`\n📊 Current database version: ${currentVersion}`);

    // Get migration plan
    const plan = getMigrationPlan(db);

    if (plan.length === 0) {
      console.log('✅ Database is up to date, no migrations needed.\n');
      return [{
        success: true,
        message: 'No migrations needed',
        details: [`Current version: ${currentVersion}`]
      }];
    }

    console.log(`\n📋 Migration plan (${plan.length} migration${plan.length === 1 ? '' : 's'}):`);
    plan.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });

    if (dryRun) {
      console.log('\n🏃 Dry-run mode: No changes will be made.\n');
      return [{
        success: true,
        message: 'Dry-run completed',
        details: plan
      }];
    }

    console.log('');

    // Execute migrations in sequence
    for (const migration of MIGRATIONS) {
      if (!migration.needsMigration(db)) {
        continue;
      }

      console.log(`\n🔄 Running migration: ${migration.name}`);
      console.log(`   ${migration.fromVersion} → ${migration.toVersion}`);

      const result = migration.runMigration(db);
      results.push(result);

      if (result.success) {
        console.log(`✅ ${result.message}`);
        if (result.details && result.details.length > 0) {
          result.details.forEach(detail => {
            console.log(`   - ${detail}`);
          });
        }
      } else {
        console.error(`❌ ${result.message}`);
        if (result.details && result.details.length > 0) {
          result.details.forEach(detail => {
            console.error(`   - ${detail}`);
          });
        }
        // Stop on first failure
        console.error('\n⚠️  Migration failed. Database rolled back to previous state.\n');
        break;
      }
    }

    // Detect final version
    const finalVersion = detectDatabaseVersion(db);
    console.log(`\n✅ Migration complete: ${currentVersion} → ${finalVersion}\n`);

    return results;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{
      success: false,
      message: `Migration orchestrator failed: ${message}`,
    }];
  }
}

/**
 * Get detailed info about a specific migration
 *
 * @param migrationName - Name of the migration
 * @returns Migration info text or null if not found
 */
export function getMigrationDetails(migrationName: string): string | null {
  const migration = MIGRATIONS.find(m => m.name === migrationName);
  if (!migration) {
    return null;
  }

  return migration.getMigrationInfo();
}

/**
 * Get list of all available migrations
 *
 * @returns Array of migration info objects
 */
export function listAllMigrations(): Omit<MigrationInfo, 'needsMigration' | 'runMigration' | 'getMigrationInfo'>[] {
  return MIGRATIONS.map(m => ({
    name: m.name,
    fromVersion: m.fromVersion,
    toVersion: m.toVersion,
  }));
}

/**
 * Check if database needs any migrations
 *
 * @param db - Database connection
 * @returns true if migrations are needed
 */
export function needsAnyMigrations(db: Database): boolean {
  return MIGRATIONS.some(m => m.needsMigration(db));
}

/**
 * Get summary of migration status
 *
 * @param db - Database connection
 * @returns Summary object
 */
export function getMigrationStatus(db: Database): {
  currentVersion: string;
  upToDate: boolean;
  pendingMigrations: number;
  migrationPlan: string[];
} {
  const currentVersion = detectDatabaseVersion(db);
  const plan = getMigrationPlan(db);

  return {
    currentVersion,
    upToDate: plan.length === 0,
    pendingMigrations: plan.length,
    migrationPlan: plan,
  };
}
