/**
 * Migration: Add decision context (v3.2.0 -> v3.2.2)
 *
 * Adds t_decision_context table for storing rich decision-making context including
 * rationale, alternatives considered, and trade-offs analysis.
 *
 * This is a backward-compatible addition - no existing tables are modified.
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
export function needsDecisionContextMigration(db: Database): boolean {
  // Check if t_decision_context table doesn't exist yet
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_decision_context'"
  ).get();

  return tableExists === undefined;
}

/**
 * Run the migration to add decision context
 */
export function migrateToDecisionContext(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction for atomicity
    db.exec('BEGIN TRANSACTION');

    // Check if table already exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_decision_context'"
    ).get();

    if (tableExists) {
      db.exec('COMMIT');
      return {
        success: true,
        message: 't_decision_context table already exists, migration skipped',
        details: ['Table already exists - no migration needed']
      };
    }

    // Create t_decision_context table
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_decision_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_key_id INTEGER NOT NULL REFERENCES m_context_keys(id) ON DELETE CASCADE,
        rationale TEXT NOT NULL,
        alternatives_considered TEXT,
        tradeoffs TEXT,
        decided_by_agent_id INTEGER REFERENCES m_agents(id),
        decision_date INTEGER DEFAULT (unixepoch()),
        related_task_id INTEGER REFERENCES t_tasks(id) ON DELETE SET NULL,
        related_constraint_id INTEGER REFERENCES t_constraints(id) ON DELETE SET NULL,
        ts INTEGER DEFAULT (unixepoch())
      );
    `);
    details.push('Created table: t_decision_context');

    // Create indexes for efficient queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decision_context_key
      ON t_decision_context(decision_key_id, ts DESC);
    `);
    details.push('Created index: idx_decision_context_key');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decision_context_task
      ON t_decision_context(related_task_id);
    `);
    details.push('Created index: idx_decision_context_task');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decision_context_constraint
      ON t_decision_context(related_constraint_id);
    `);
    details.push('Created index: idx_decision_context_constraint');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Migration to v3.2.2 completed successfully',
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
export function getDecisionContextMigrationInfo(): string {
  return `
Migration: Add Decision Context (v3.2.0 -> v3.2.2)

This migration adds rich decision-making context tracking:
- New table: t_decision_context
- Stores: rationale, alternatives considered, trade-offs (pros/cons)
- Links: to decisions, tasks, and constraints
- Indexes: Optimized for key-based and relationship-based queries

Schema:
- id: Auto-increment primary key
- decision_key_id: Reference to decision (CASCADE delete)
- rationale: Required explanation of why decision was made
- alternatives_considered: JSON array of alternatives ["Alternative 1", ...]
- tradeoffs: JSON object with pros/cons {"pros": [...], "cons": [...]}
- decided_by_agent_id: Optional agent who made the decision
- decision_date: When decision was made (auto-set)
- related_task_id: Optional link to task (SET NULL on delete)
- related_constraint_id: Optional link to constraint (SET NULL on delete)
- ts: Record creation timestamp

Backward Compatibility:
- No existing tables modified
- Zero migration pain - CREATE TABLE IF NOT EXISTS
- Existing code continues to work without changes
- New actions are optional enhancements

This migration is idempotent and safe to run multiple times.
  `.trim();
}
