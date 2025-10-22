/**
 * Migration: Add pruned files tracking (v3.4.x -> v3.5.0)
 *
 * Adds t_task_pruned_files table for audit trail of auto-pruned non-existent files.
 * This enables project archaeology when files were planned but never created.
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
export function needsPrunedFilesMigration(db: Database): boolean {
  // Check if t_task_pruned_files table doesn't exist yet
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_pruned_files'"
  ).get();

  return tableExists === undefined;
}

/**
 * Run the migration to add pruned files tracking
 */
export function migrateToPrunedFiles(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction for atomicity
    db.exec('BEGIN TRANSACTION');

    // Check if table already exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_task_pruned_files'"
    ).get();

    if (tableExists) {
      db.exec('COMMIT');
      return {
        success: true,
        message: 't_task_pruned_files table already exists, migration skipped',
        details: ['Table already exists - no migration needed']
      };
    }

    // Create t_task_pruned_files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_pruned_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES t_tasks(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        pruned_ts INTEGER DEFAULT (unixepoch()),
        linked_decision_key_id INTEGER REFERENCES m_context_keys(id) ON DELETE SET NULL
      );
    `);
    details.push('Created table: t_task_pruned_files');

    // Create index for task lookup
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pruned_task
      ON t_task_pruned_files(task_id);
    `);
    details.push('Created index: idx_pruned_task');

    // Create index for decision linking
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pruned_decision
      ON t_task_pruned_files(linked_decision_key_id);
    `);
    details.push('Created index: idx_pruned_decision');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Migration to v3.5.0 completed successfully',
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
export function getPrunedFilesMigrationInfo(): string {
  return `
Migration: Add Pruned Files Tracking (v3.4.x -> v3.5.0)

This migration adds audit trail for auto-pruned non-existent watched files:
- New table: t_task_pruned_files
- Tracks files removed when transitioning to 'waiting_review'
- Optional decision linking for WHY reasoning
- Enables project archaeology

Schema:
- id: Auto-incrementing primary key
- task_id: Task that watched this file (CASCADE on delete)
- file_path: Raw file path string (not normalized to m_files)
- pruned_ts: Unix timestamp when file was pruned
- linked_decision_key_id: Optional decision key explaining why file was never created

Indexes:
- idx_pruned_task: Fast lookup of pruned files for a task
- idx_pruned_decision: Fast lookup of pruned files linked to decisions

This migration is idempotent and safe to run multiple times.
  `.trim();
}
