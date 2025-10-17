/**
 * Migration: Add Task Management Tables (v2.1.x -> v3.0.0)
 *
 * Adds Kanban-style task tracking system to reduce token usage
 * from decisions table being misused for task tracking.
 *
 * Tables Added:
 * - m_task_statuses (master table for task statuses)
 * - t_tasks (core task data, token-efficient)
 * - t_task_details (large text stored separately)
 * - t_task_tags (many-to-many task tagging)
 * - t_task_decision_links (link tasks to decisions)
 * - t_task_constraint_links (link tasks to constraints)
 * - t_task_file_links (link tasks to files)
 *
 * View Added:
 * - v_task_board (token-efficient task board view)
 *
 * Triggers Added:
 * - trg_log_task_create (activity log for task creation)
 * - trg_log_task_status_change (activity log for status changes)
 * - trg_update_task_timestamp (auto-update updated_ts)
 *
 * Initial Data:
 * - Task statuses: todo, in_progress, waiting_review, blocked, done, archived
 * - Config keys for stale task detection
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
  // Check if new table doesn't exist (m_task_statuses)
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='m_task_statuses'"
  ).get();

  return tableExists === undefined;
}

/**
 * Run the migration
 */
export function runMigration(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // ============================================================================
    // 1. Create Master Table: m_task_statuses
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS m_task_statuses (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
    `);
    details.push('Created table: m_task_statuses');

    // ============================================================================
    // 2. Create Transaction Tables
    // ============================================================================

    // Task core data (token-efficient: no large text here)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status_id INTEGER NOT NULL REFERENCES m_task_statuses(id),
        priority INTEGER DEFAULT 2,
        assigned_agent_id INTEGER REFERENCES m_agents(id),
        created_by_agent_id INTEGER REFERENCES m_agents(id),
        layer_id INTEGER REFERENCES m_layers(id),
        created_ts INTEGER DEFAULT (unixepoch()),
        updated_ts INTEGER DEFAULT (unixepoch()),
        completed_ts INTEGER
      );
    `);
    details.push('Created table: t_tasks');

    // Task details (large text stored separately)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_details (
        task_id INTEGER PRIMARY KEY REFERENCES t_tasks(id) ON DELETE CASCADE,
        description TEXT,
        acceptance_criteria TEXT,
        notes TEXT
      );
    `);
    details.push('Created table: t_task_details');

    // Task tags (many-to-many)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_tags (
        task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES m_tags(id),
        PRIMARY KEY (task_id, tag_id)
      );
    `);
    details.push('Created table: t_task_tags');

    // Task-decision links
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_decision_links (
        task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        decision_key_id INTEGER REFERENCES m_context_keys(id),
        link_type TEXT DEFAULT 'implements',
        PRIMARY KEY (task_id, decision_key_id)
      );
    `);
    details.push('Created table: t_task_decision_links');

    // Task-constraint links
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_constraint_links (
        task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        constraint_id INTEGER REFERENCES t_constraints(id),
        PRIMARY KEY (task_id, constraint_id)
      );
    `);
    details.push('Created table: t_task_constraint_links');

    // Task-file links
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_task_file_links (
        task_id INTEGER REFERENCES t_tasks(id) ON DELETE CASCADE,
        file_id INTEGER REFERENCES m_files(id),
        PRIMARY KEY (task_id, file_id)
      );
    `);
    details.push('Created table: t_task_file_links');

    // ============================================================================
    // 3. Create Indexes
    // ============================================================================
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_status ON t_tasks(status_id);
    `);
    details.push('Created index: idx_task_status');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_updated ON t_tasks(updated_ts DESC);
    `);
    details.push('Created index: idx_task_updated');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_assignee ON t_tasks(assigned_agent_id);
    `);
    details.push('Created index: idx_task_assignee');

    // ============================================================================
    // 4. Create View: v_task_board
    // ============================================================================
    db.exec(`
      CREATE VIEW IF NOT EXISTS v_task_board AS
      SELECT
        t.id,
        t.title,
        s.name as status,
        t.priority,
        a.name as assigned_to,
        l.name as layer,
        t.created_ts,
        t.updated_ts,
        t.completed_ts,
        (SELECT GROUP_CONCAT(tg2.name, ', ')
         FROM t_task_tags tt2
         JOIN m_tags tg2 ON tt2.tag_id = tg2.id
         WHERE tt2.task_id = t.id) as tags
      FROM t_tasks t
      LEFT JOIN m_task_statuses s ON t.status_id = s.id
      LEFT JOIN m_agents a ON t.assigned_agent_id = a.id
      LEFT JOIN m_layers l ON t.layer_id = l.id;
    `);
    details.push('Created view: v_task_board');

    // ============================================================================
    // 5. Create Triggers
    // ============================================================================

    // Task creation activity log
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_log_task_create
      AFTER INSERT ON t_tasks
      BEGIN
        INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
        SELECT
          COALESCE(NEW.created_by_agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
          'task_create',
          'task_id:' || NEW.id,
          NEW.layer_id,
          json_object('title', NEW.title, 'status_id', NEW.status_id, 'priority', NEW.priority);
      END;
    `);
    details.push('Created trigger: trg_log_task_create');

    // Task status change activity log
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_log_task_status_change
      AFTER UPDATE OF status_id ON t_tasks
      WHEN OLD.status_id != NEW.status_id
      BEGIN
        INSERT INTO t_activity_log (agent_id, action_type, target, layer_id, details)
        SELECT
          COALESCE(NEW.assigned_agent_id, (SELECT id FROM m_agents WHERE name = 'system' LIMIT 1)),
          'task_status_change',
          'task_id:' || NEW.id,
          NEW.layer_id,
          json_object('old_status', OLD.status_id, 'new_status', NEW.status_id);
      END;
    `);
    details.push('Created trigger: trg_log_task_status_change');

    // Auto-update task timestamp
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_update_task_timestamp
      AFTER UPDATE ON t_tasks
      BEGIN
        UPDATE t_tasks SET updated_ts = unixepoch() WHERE id = NEW.id;
      END;
    `);
    details.push('Created trigger: trg_update_task_timestamp');

    // ============================================================================
    // 6. Seed Initial Data
    // ============================================================================

    // Insert task statuses
    const statusInsert = db.prepare(
      'INSERT INTO m_task_statuses (id, name) VALUES (?, ?)'
    );

    const statuses = [
      { id: 1, name: 'todo' },
      { id: 2, name: 'in_progress' },
      { id: 3, name: 'waiting_review' },
      { id: 4, name: 'blocked' },
      { id: 5, name: 'done' },
      { id: 6, name: 'archived' }
    ];

    for (const status of statuses) {
      statusInsert.run(status.id, status.name);
    }
    details.push('Seeded task statuses: todo, in_progress, waiting_review, blocked, done, archived');

    // Insert config keys for task management
    const configInsert = db.prepare(
      'INSERT INTO m_config (key, value) VALUES (?, ?)'
    );

    const configs = [
      { key: 'task_stale_hours_in_progress', value: '2' },
      { key: 'task_stale_hours_waiting_review', value: '24' },
      { key: 'task_auto_stale_enabled', value: '1' }
    ];

    for (const config of configs) {
      configInsert.run(config.key, config.value);
    }
    details.push('Seeded config keys: task_stale_hours_in_progress, task_stale_hours_waiting_review, task_auto_stale_enabled');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Task tables migration completed successfully (v2.1.x -> v3.0.0).',
      details
    };

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Task tables migration failed: ${message}`,
      details
    };
  }
}

/**
 * Get migration info
 */
export function getMigrationInfo(): string {
  return `
Migration: Add Task Management Tables (v2.1.x -> v3.0.0)

This migration adds Kanban-style task tracking to reduce token usage
from the decisions table being misused for task/todo tracking.

The migration will:
1. Create m_task_statuses master table
2. Create 6 transaction tables for task management
3. Create 3 indexes for query optimization
4. Create v_task_board view for token-efficient queries
5. Create 3 triggers for activity logging and timestamp updates
6. Seed task statuses (6 statuses)
7. Seed config keys for stale task detection (3 keys)

Tables Added:
- m_task_statuses (1 master table)
- t_tasks, t_task_details, t_task_tags (3 core tables)
- t_task_decision_links, t_task_constraint_links, t_task_file_links (3 link tables)

View Added:
- v_task_board (token-efficient task board view)

Triggers Added:
- trg_log_task_create (activity log)
- trg_log_task_status_change (activity log)
- trg_update_task_timestamp (auto-update)

This migration is safe and reversible via backup restoration.
  `.trim();
}
