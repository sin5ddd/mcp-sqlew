/**
 * Migration: Add task dependencies (v3.1.2 -> v3.2.0)
 *
 * Adds t_task_dependencies table for tracking blocking relationships between tasks.
 * This enables "Task A blocks Task B" functionality.
 */

import { Database } from 'better-sqlite3';

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * Check if migration is needed
 */
export function needsTaskDependenciesMigration(db: Database): boolean {
  // Check if t_task_dependencies table doesn't exist yet
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'"
  ).get();

  return tableExists === undefined;
}

/**
 * Run the migration to add task dependencies
 */
export function migrateToTaskDependencies(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction for atomicity
    db.exec('BEGIN TRANSACTION');

    // Check if table already exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_dependencies'"
    ).get();

    if (tableExists) {
      db.exec('COMMIT');
      return {
        success: true,
        message: 't_task_dependencies table already exists, migration skipped',
        details: ['Table already exists - no migration needed']
      };
    }

    // Create t_task_dependencies table
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_dependencies (
        blocker_task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        blocked_task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        created_ts INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (blocker_task_id, blocked_task_id)
      );
    `);
    details.push('Created table: t_task_dependencies');

    // Create index for reverse lookups (what blocks this task?)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_deps_blocked
      ON t_task_dependencies(blocked_task_id);
    `);
    details.push('Created index: idx_task_deps_blocked');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Migration to v3.2.0 completed successfully',
      details
    };

  } catch (error) {
    // Rollback on error
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Migration failed: ${message}`,
      details
    };
  }
}

/**
 * Get migration info
 */
export function getTaskDependenciesMigrationInfo(): string {
  return `
Migration: Add Task Dependencies (v3.1.2 -> v3.2.0)

This migration adds task dependency tracking for blocking relationships:
- New table: t_task_dependencies
- Primary key: (blocker_task_id, blocked_task_id) - prevents duplicates
- Index: idx_task_deps_blocked for efficient "what blocks this task?" queries
- CASCADE deletion: Dependencies are removed when tasks are deleted

Schema:
- blocker_task_id: Task that must be completed first
- blocked_task_id: Task that is blocked/waiting
- created_ts: When the dependency was created

This migration is idempotent and safe to run multiple times.
  `.trim();
}
