/**
 * Migration: Add v2.1.0 features (v2.0.0 -> v2.1.0)
 *
 * Migrates database from v2.0.0 to v2.1.0:
 * - Adds t_activity_log table (FR-001)
 * - Adds t_decision_templates table (FR-006)
 * - Adds 4 activity logging triggers
 * - Adds 5 built-in decision templates
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
  // Check if new tables don't exist yet
  const activityLogExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_activity_log'"
  ).get();

  const templatesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_decision_templates'"
  ).get();

  return activityLogExists === undefined || templatesExists === undefined;
}

/**
 * Run the migration
 */
export function runMigration(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Add t_activity_log table (FR-001)
    const activityLogExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_activity_log'"
    ).get();

    if (!activityLogExists) {
      db.exec(`
        CREATE TABLE t_activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER DEFAULT (unixepoch()),
          agent_id INTEGER NOT NULL REFERENCES m_agents(id),
          action_type TEXT NOT NULL,
          target TEXT NOT NULL,
          layer_id INTEGER REFERENCES m_layers(id),
          details TEXT
        );
      `);
      details.push('Created table: t_activity_log (FR-001)');

      // Add indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_activity_log_ts ON t_activity_log(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON t_activity_log(agent_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_action ON t_activity_log(action_type);
      `);
      details.push('Created indexes for t_activity_log');
    }

    // 2. Add t_decision_templates table (FR-006)
    const templatesExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t_decision_templates'"
    ).get();

    if (!templatesExists) {
      db.exec(`
        CREATE TABLE t_decision_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          defaults TEXT NOT NULL,
          required_fields TEXT,
          created_by INTEGER REFERENCES m_agents(id),
          ts INTEGER DEFAULT (unixepoch())
        );
      `);
      details.push('Created table: t_decision_templates (FR-006)');

      // Insert built-in templates
      const insertTemplate = db.prepare(`
        INSERT OR IGNORE INTO t_decision_templates (name, defaults, required_fields, created_by, ts)
        VALUES (?, ?, ?, NULL, unixepoch())
      `);

      insertTemplate.run(
        'breaking_change',
        '{"layer":"business","status":"active","tags":["breaking"]}',
        null
      );
      insertTemplate.run(
        'security_vulnerability',
        '{"layer":"infrastructure","status":"active","tags":["security","vulnerability"]}',
        '["cve_id","severity"]'
      );
      insertTemplate.run(
        'performance_optimization',
        '{"layer":"business","status":"active","tags":["performance","optimization"]}',
        null
      );
      insertTemplate.run(
        'deprecation',
        '{"layer":"business","status":"active","tags":["deprecation"]}',
        null
      );
      insertTemplate.run(
        'architecture_decision',
        '{"layer":"infrastructure","status":"active","tags":["architecture","adr"]}',
        null
      );

      details.push('Inserted 5 built-in decision templates');
    }

    // 3. Add activity logging triggers (FR-001)
    const triggerNames = [
      'trg_log_decision_set',
      'trg_log_decision_update',
      'trg_log_message_send',
      'trg_log_file_record'
    ];

    let triggersCreated = 0;

    // Check if triggers exist
    for (const triggerName of triggerNames) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name=?"
      ).get(triggerName);

      if (!exists) {
        triggersCreated++;
      }
    }

    if (triggersCreated > 0) {
      // Create triggers
      db.exec(`
        -- Decision Addition Log
        CREATE TRIGGER IF NOT EXISTS trg_log_decision_set
        AFTER INSERT ON t_decisions
        BEGIN
          INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
          SELECT
            COALESCE(NEW.agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
            'decision_set',
            (SELECT key FROM m_context_keys WHERE id = NEW.key_id),
            NEW.layer_id,
            json_object('value', NEW.value, 'version', NEW.version, 'status', NEW.status);
        END;

        -- Decision Update Log
        CREATE TRIGGER IF NOT EXISTS trg_log_decision_update
        AFTER UPDATE ON t_decisions
        WHEN OLD.value != NEW.value OR OLD.version != NEW.version OR OLD.status != NEW.status
        BEGIN
          INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
          SELECT
            COALESCE(NEW.agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
            'decision_update',
            (SELECT key FROM m_context_keys WHERE id = NEW.key_id),
            NEW.layer_id,
            json_object('old_value', OLD.value, 'new_value', NEW.value, 'old_version', OLD.version, 'new_version', NEW.version, 'old_status', OLD.status, 'new_status', NEW.status);
        END;

        -- Message Send Log
        CREATE TRIGGER IF NOT EXISTS trg_log_message_send
        AFTER INSERT ON t_agent_messages
        BEGIN
          INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
          SELECT
            NEW.from_agent_id,
            'message_send',
            'msg_id:' || NEW.id,
            NULL,
            json_object('to_agent_id', NEW.to_agent_id, 'msg_type', NEW.msg_type, 'priority', NEW.priority);
        END;

        -- File Change Log
        CREATE TRIGGER IF NOT EXISTS trg_log_file_record
        AFTER INSERT ON t_file_changes
        BEGIN
          INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
          SELECT
            NEW.agent_id,
            'file_record',
            (SELECT path FROM m_files WHERE id = NEW.file_id),
            NEW.layer_id,
            json_object('change_type', NEW.change_type, 'description', NEW.description);
        END;
      `);

      details.push(`Created ${triggersCreated} activity logging triggers`);
    }

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Migration to v2.1.0 completed successfully.',
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
Migration: Add v2.1.0 Features (v2.0.0 -> v2.1.0)

This migration adds new features from the v2.1.0 release:

**FR-001: Activity Log**
- New table: t_activity_log
- 3 new indexes for performance
- 4 new triggers for automatic logging

**FR-006: Decision Templates**
- New table: t_decision_templates
- 5 built-in templates (breaking_change, security_vulnerability, performance_optimization, deprecation, architecture_decision)

**New Features:**
- Activity logging for all major operations
- Template-based decision creation
- Advanced query capabilities (FR-004)
- Batch operations (FR-005)
- Smart defaults with inference (FR-002)
- Lightweight update polling (FR-003)
- Standalone CLI query tool (FR-007)

This migration is safe and reversible via backup restoration.
  `.trim();
}
