/**
 * Migration: Add table prefixes (v1.0.1 -> v1.1.0)
 *
 * Migrates database from unprefixed table names to prefixed names:
 * - Master tables: m_ prefix
 * - Transaction tables: t_ prefix
 * - Views: v_ prefix
 * - Triggers: trg_ prefix
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
export function needsMigration(db: Database): boolean {
  // Check if old table exists (agents) and new table doesn't exist (m_agents)
  const oldExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
  ).get();

  const newExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='m_agents'"
  ).get();

  return oldExists !== undefined && newExists === undefined;
}

/**
 * Run the migration
 */
export function runMigration(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Drop old views (they reference old table names)
    const oldViews = [
      'tagged_decisions',
      'active_context',
      'layer_summary',
      'unread_messages_by_priority',
      'recent_file_changes',
      'tagged_constraints'
    ];

    for (const view of oldViews) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='view' AND name=?"
      ).get(view);

      if (exists) {
        db.exec(`DROP VIEW IF EXISTS ${view}`);
        details.push(`Dropped view: ${view}`);
      }
    }

    // 2. Drop old triggers
    const oldTriggers = [
      'auto_delete_old_messages',
      'auto_delete_old_file_changes',
      'record_decision_history'
    ];

    for (const trigger of oldTriggers) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name=?"
      ).get(trigger);

      if (exists) {
        db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
        details.push(`Dropped trigger: ${trigger}`);
      }
    }

    // 3. Rename master tables
    const masterTables = [
      { old: 'agents', new: 'm_agents' },
      { old: 'files', new: 'm_files' },
      { old: 'context_keys', new: 'm_context_keys' },
      { old: 'constraint_categories', new: 'm_constraint_categories' },
      { old: 'layers', new: 'm_layers' },
      { old: 'tags', new: 'm_tags' },
      { old: 'scopes', new: 'm_scopes' },
      { old: 'config', new: 'm_config' }
    ];

    for (const table of masterTables) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table.old);

      if (exists) {
        db.exec(`ALTER TABLE ${table.old} RENAME TO ${table.new}`);
        details.push(`Renamed table: ${table.old} -> ${table.new}`);
      }
    }

    // 4. Rename transaction tables
    const transactionTables = [
      { old: 'decisions', new: 't_decisions' },
      { old: 'decisions_numeric', new: 't_decisions_numeric' },
      { old: 'decision_history', new: 't_decision_history' },
      { old: 'decision_tags', new: 't_decision_tags' },
      { old: 'decision_scopes', new: 't_decision_scopes' },
      { old: 'agent_messages', new: 't_agent_messages' },
      { old: 'file_changes', new: 't_file_changes' },
      { old: 'constraints', new: 't_constraints' },
      { old: 'constraint_tags', new: 't_constraint_tags' }
    ];

    for (const table of transactionTables) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table.old);

      if (exists) {
        db.exec(`ALTER TABLE ${table.old} RENAME TO ${table.new}`);
        details.push(`Renamed table: ${table.old} -> ${table.new}`);
      }
    }

    // 5. Create m_config table if it doesn't exist (new in v1.1.0)
    const configExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='m_config'"
    ).get();

    if (!configExists) {
      db.exec(`
        CREATE TABLE m_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Insert default config values
      db.prepare('INSERT INTO m_config (key, value) VALUES (?, ?)').run('autodelete_ignore_weekend', '0');
      db.prepare('INSERT INTO m_config (key, value) VALUES (?, ?)').run('autodelete_message_hours', '24');
      db.prepare('INSERT INTO m_config (key, value) VALUES (?, ?)').run('autodelete_file_history_days', '7');

      details.push('Created table: m_config (new in v1.1.0)');
      details.push('Initialized config with default values');
    }

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Migration completed successfully. New views and triggers will be created by schema initialization.',
      details
    };

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');

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
export function getMigrationInfo(): string {
  return `
Migration: Add Table Prefixes (v1.0.1 -> v1.1.0)

This migration adds category-based prefixes to all database objects:
- Master tables: m_ prefix (8 tables)
- Transaction tables: t_ prefix (9 tables)
- Views: v_ prefix (6 views)
- Triggers: trg_ prefix (1 trigger)

The migration will:
1. Drop old views (they reference old table names)
2. Drop old triggers (if any exist from previous versions)
3. Rename all tables to new prefixed names
4. New views and triggers will be created by schema initialization

This migration is safe and reversible via backup restoration.
  `.trim();
}
