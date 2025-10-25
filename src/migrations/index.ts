/**
 * Migration Orchestrator (v4.0.0 - Hybrid Support)
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
 * - Hybrid support: better-sqlite3 (Database) OR Knex.js (DatabaseAdapter)
 *
 * Migration Strategy (v4.0.0+):
 * - Knex migrations: Run automatically via initializeDatabase() → knex.migrate.latest()
 * - Custom migrations: Legacy orchestrator for v1.x-v3.x upgrades (this file)
 * - New deployments: Use Knex migrations only (src/migrations/knex/*)
 * - Old upgrades: Use custom migrations first, then Knex migrations
 */

import { Database } from 'better-sqlite3';
import { DatabaseAdapter } from '../adapters/index.js';
import { Knex } from 'knex';
import * as tablePrefixes from './add-table-prefixes.js';
import * as v210Features from './add-v2.1.0-features.js';
import * as taskTables from './add-task-tables.js';
import * as taskDependencies from './add-task-dependencies.js';
import * as decisionContext from './add-decision-context.js';
import * as prunedFiles from './add-v3.5.0-pruned-files.js';
import * as helpSystemTables from './add-help-system-tables.js';
import * as seedToolMetadata from './seed-tool-metadata.js';
import * as seedHelpData from './seed-help-data.js';
import * as tokenTracking from './add-token-tracking.js';

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
 * Type guard to check if input is DatabaseAdapter
 */
function isDatabaseAdapter(dbOrAdapter: Database | DatabaseAdapter): dbOrAdapter is DatabaseAdapter {
  return typeof (dbOrAdapter as any).getKnex === 'function';
}

/**
 * Get Database instance from either Database or DatabaseAdapter
 * For Knex adapters, we need to access the underlying better-sqlite3 connection
 *
 * NOTE: This is a temporary bridge for backward compatibility with custom migrations.
 * New code should use Knex query builder via adapter.getKnex() instead.
 */
function getDatabase(dbOrAdapter: Database | DatabaseAdapter): Database {
  if (isDatabaseAdapter(dbOrAdapter)) {
    // For SQLiteAdapter, access the underlying better-sqlite3 connection
    // This assumes SQLiteAdapter stores it in a private property
    const knex = dbOrAdapter.getKnex();
    const client = (knex as any).client;

    if (client && client.driver && client.driver.name) {
      // Access the better-sqlite3 connection from Knex client
      const connections = (client as any)._connectionCache || {};
      const connectionKey = Object.keys(connections)[0];

      if (connectionKey && connections[connectionKey]) {
        return connections[connectionKey];
      }
    }

    // Fallback: throw error if we can't extract Database
    throw new Error('Cannot extract Database from DatabaseAdapter for custom migrations. Please use Knex migrations instead.');
  }

  return dbOrAdapter;
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
  {
    name: 'add-help-system-tables',
    fromVersion: '3.5.3',
    toVersion: '3.6.0',
    needsMigration: helpSystemTables.needsHelpSystemMigration,
    runMigration: helpSystemTables.migrateToHelpSystem,
    getMigrationInfo: helpSystemTables.getHelpSystemMigrationInfo,
  },
  {
    name: 'seed-tool-metadata',
    fromVersion: '3.6.0',
    toVersion: '3.6.0',
    needsMigration: seedToolMetadata.needsToolMetadataSeeding,
    runMigration: (db) => {
      try {
        seedToolMetadata.seedToolMetadata(db);
        return {
          success: true,
          message: 'Tool metadata seeded successfully',
          details: [seedToolMetadata.getToolMetadataSeedingInfo()]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to seed tool metadata: ${message}`
        };
      }
    },
    getMigrationInfo: seedToolMetadata.getToolMetadataSeedingInfo,
  },
  {
    name: 'seed-help-data',
    fromVersion: '3.6.0',
    toVersion: '3.6.0',
    needsMigration: seedHelpData.needsHelpDataSeeding,
    runMigration: (db) => {
      try {
        seedHelpData.seedHelpData(db);
        return {
          success: true,
          message: 'Help system use-case data seeded successfully',
          details: [seedHelpData.getHelpDataSeedingInfo()]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to seed help data: ${message}`
        };
      }
    },
    getMigrationInfo: seedHelpData.getHelpDataSeedingInfo,
  },
  {
    name: 'add-token-tracking',
    fromVersion: '3.6.0',
    toVersion: '3.6.0',
    needsMigration: tokenTracking.needsTokenTrackingMigration,
    runMigration: tokenTracking.migrateToTokenTracking,
    getMigrationInfo: tokenTracking.getTokenTrackingMigrationInfo,
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
 * - v3.5.0: Has t_task_pruned_files but no m_help_tools
 * - v3.6.0: Has m_help_tools (help system tables)
 * - v4.0.0: Has knex_migrations table (Knex migration system)
 *
 * @param dbOrAdapter - Database connection or DatabaseAdapter
 * @returns Detected version string
 */
export function detectDatabaseVersion(dbOrAdapter: Database | DatabaseAdapter): string {
  try {
    const db = getDatabase(dbOrAdapter);
    // Check for help system tables (v3.6.0)
    const hasHelpTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='m_help_tools'"
    ).get();

    if (hasHelpTables) {
      return '3.6.0';
    }

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
 * @param dbOrAdapter - Database connection or DatabaseAdapter
 * @returns Array of migration names that need to run
 */
export function getMigrationPlan(dbOrAdapter: Database | DatabaseAdapter): string[] {
  const db = getDatabase(dbOrAdapter);
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
 * NOTE (v4.0.0+): This function runs custom migrations (v1.x-v3.x upgrades only).
 * Knex migrations run automatically via initializeDatabase() → knex.migrate.latest().
 *
 * @param dbOrAdapter - Database connection or DatabaseAdapter
 * @param dryRun - If true, only show plan without executing (default: false)
 * @returns Array of migration results
 */
export function runAllMigrations(dbOrAdapter: Database | DatabaseAdapter, dryRun: boolean = false): MigrationResult[] {
  const db = getDatabase(dbOrAdapter);
  const results: MigrationResult[] = [];

  try {
    // Detect current version
    const currentVersion = detectDatabaseVersion(dbOrAdapter);
    console.log(`\n📊 Current database version: ${currentVersion}`);

    // Get migration plan
    const plan = getMigrationPlan(dbOrAdapter);

    if (plan.length === 0) {
      console.log('✅ Database is up to date, no custom migrations needed.\n');
      if (isDatabaseAdapter(dbOrAdapter)) {
        console.log('ℹ️  Knex migrations were run automatically via initializeDatabase().\n');
      }
      return [{
        success: true,
        message: 'No migrations needed',
        details: [`Current version: ${currentVersion}`]
      }];
    }

    console.log(`\n📋 Migration plan (${plan.length} custom migration${plan.length === 1 ? '' : 's'}):`);
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
    const finalVersion = detectDatabaseVersion(dbOrAdapter);
    console.log(`\n✅ Custom migrations complete: ${currentVersion} → ${finalVersion}\n`);

    if (isDatabaseAdapter(dbOrAdapter)) {
      console.log('ℹ️  Knex migrations were run automatically via initializeDatabase().\n');
    }

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
 * @param dbOrAdapter - Database connection or DatabaseAdapter
 * @returns true if migrations are needed
 */
export function needsAnyMigrations(dbOrAdapter: Database | DatabaseAdapter): boolean {
  const db = getDatabase(dbOrAdapter);
  return MIGRATIONS.some(m => m.needsMigration(db));
}

/**
 * Get summary of migration status
 *
 * @param dbOrAdapter - Database connection or DatabaseAdapter
 * @returns Summary object
 */
export function getMigrationStatus(dbOrAdapter: Database | DatabaseAdapter): {
  currentVersion: string;
  upToDate: boolean;
  pendingMigrations: number;
  migrationPlan: string[];
} {
  const currentVersion = detectDatabaseVersion(dbOrAdapter);
  const plan = getMigrationPlan(dbOrAdapter);

  return {
    currentVersion,
    upToDate: plan.length === 0,
    pendingMigrations: plan.length,
    migrationPlan: plan,
  };
}
