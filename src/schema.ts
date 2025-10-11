/**
 * Schema initialization module
 * Loads and executes SQL schema from docs/schema.sql
 */

import { Database } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize database schema
 * Reads schema.sql and executes all CREATE and INSERT statements
 *
 * @param db - SQLite database connection
 * @throws Error if schema initialization fails
 */
export function initializeSchema(db: Database): void {
  try {
    // Read schema file
    const schemaPath = join(__dirname, '..', 'assets', 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    // Execute schema in a transaction for atomicity
    db.exec('BEGIN TRANSACTION');

    try {
      // Execute the entire schema
      // SQLite's exec() can handle multiple statements separated by semicolons
      db.exec(schemaSql);

      db.exec('COMMIT');

      console.log('✓ Database schema initialized successfully');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize schema: ${message}`);
  }
}

/**
 * Check if schema is already initialized
 * Checks for existence of the m_agents table
 *
 * @param db - SQLite database connection
 * @returns true if schema exists, false otherwise
 */
export function isSchemaInitialized(db: Database): boolean {
  try {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name='m_agents' OR name='agents')"
    ).get();

    return result !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Get schema version information
 * Returns counts of all master tables to verify schema integrity
 *
 * @param db - SQLite database connection
 * @returns Object with table counts
 */
export function getSchemaInfo(db: Database): {
  agents: number;
  files: number;
  context_keys: number;
  layers: number;
  tags: number;
  scopes: number;
  constraint_categories: number;
} {
  const counts = {
    agents: 0,
    files: 0,
    context_keys: 0,
    layers: 0,
    tags: 0,
    scopes: 0,
    constraint_categories: 0,
  };

  try {
    counts.agents = (db.prepare('SELECT COUNT(*) as count FROM m_agents').get() as { count: number }).count;
    counts.files = (db.prepare('SELECT COUNT(*) as count FROM m_files').get() as { count: number }).count;
    counts.context_keys = (db.prepare('SELECT COUNT(*) as count FROM m_context_keys').get() as { count: number }).count;
    counts.layers = (db.prepare('SELECT COUNT(*) as count FROM m_layers').get() as { count: number }).count;
    counts.tags = (db.prepare('SELECT COUNT(*) as count FROM m_tags').get() as { count: number }).count;
    counts.scopes = (db.prepare('SELECT COUNT(*) as count FROM m_scopes').get() as { count: number }).count;
    counts.constraint_categories = (db.prepare('SELECT COUNT(*) as count FROM m_constraint_categories').get() as { count: number }).count;
  } catch (error) {
    // If tables don't exist yet, return zeros
  }

  return counts;
}

/**
 * Verify schema integrity
 * Checks that all required tables, indexes, views, and triggers exist
 *
 * @param db - SQLite database connection
 * @returns Object with integrity check results
 */
export function verifySchemaIntegrity(db: Database): {
  valid: boolean;
  missing: string[];
  errors: string[];
} {
  const result = {
    valid: true,
    missing: [] as string[],
    errors: [] as string[],
  };

  const requiredTables = [
    'm_agents', 'm_files', 'm_context_keys', 'm_constraint_categories',
    'm_layers', 'm_tags', 'm_scopes', 'm_config',
    't_decisions', 't_decisions_numeric', 't_decision_history',
    't_decision_tags', 't_decision_scopes',
    't_agent_messages', 't_file_changes', 't_constraints', 't_constraint_tags',
  ];

  const requiredViews = [
    'v_tagged_decisions', 'v_active_context', 'v_layer_summary',
    'v_unread_messages_by_priority', 'v_recent_file_changes', 'v_tagged_constraints',
  ];

  const requiredTriggers = [
    'trg_record_decision_history',
  ];

  try {
    // Check tables
    for (const table of requiredTables) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);

      if (!exists) {
        result.valid = false;
        result.missing.push(`table:${table}`);
      }
    }

    // Check views
    for (const view of requiredViews) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='view' AND name=?"
      ).get(view);

      if (!exists) {
        result.valid = false;
        result.missing.push(`view:${view}`);
      }
    }

    // Check triggers
    for (const trigger of requiredTriggers) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name=?"
      ).get(trigger);

      if (!exists) {
        result.valid = false;
        result.missing.push(`trigger:${trigger}`);
      }
    }

    // Verify standard data exists
    const layerCount = (db.prepare('SELECT COUNT(*) as count FROM m_layers').get() as { count: number }).count;
    if (layerCount < 5) {
      result.errors.push(`Expected 5 standard layers, found ${layerCount}`);
      result.valid = false;
    }

    const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM m_constraint_categories').get() as { count: number }).count;
    if (categoryCount < 3) {
      result.errors.push(`Expected 3 standard categories, found ${categoryCount}`);
      result.valid = false;
    }

    const tagCount = (db.prepare('SELECT COUNT(*) as count FROM m_tags').get() as { count: number }).count;
    if (tagCount < 10) {
      result.errors.push(`Expected 10 standard tags, found ${tagCount}`);
      result.valid = false;
    }

    const configCount = (db.prepare('SELECT COUNT(*) as count FROM m_config').get() as { count: number }).count;
    if (configCount < 3) {
      result.errors.push(`Expected 3 m_config entries, found ${configCount}`);
      result.valid = false;
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
