/**
 * Database connection and initialization module
 * Handles SQLite database setup with configurable path
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve, isAbsolute } from 'path';
import { initializeSchema, isSchemaInitialized, verifySchemaIntegrity } from './schema.js';
import { DEFAULT_DB_PATH, DB_BUSY_TIMEOUT } from './constants.js';
import type { Database as DatabaseType } from './types.js';
import { performAutoCleanup } from './utils/cleanup.js';
import { runAllMigrations, needsAnyMigrations } from './migrations/index.js';

let dbInstance: DatabaseType | null = null;

/**
 * Initialize database connection
 * Creates database file and folder if they don't exist
 * Initializes schema on first run
 *
 * @param dbPath - Optional database path (defaults to .sqlew/sqlew.db)
 * @returns SQLite database instance
 */
export function initializeDatabase(dbPath?: string): DatabaseType {
  // If already initialized, return existing instance
  if (dbInstance) {
    return dbInstance;
  }

  try {
    // Use provided path or default
    const finalPath = dbPath || DEFAULT_DB_PATH;

    // Convert to absolute path if relative
    const absolutePath = isAbsolute(finalPath)
      ? finalPath
      : resolve(process.cwd(), finalPath);

    // Create directory if it doesn't exist
    const dbDir = dirname(absolutePath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      console.log(`✓ Created database directory: ${dbDir}`);
    }

    // Open database connection
    const db = new Database(absolutePath, {
      verbose: process.env.DEBUG_SQL ? console.log : undefined,
    });

    // Configure database
    db.pragma('journal_mode = WAL');  // Write-Ahead Logging for better concurrency
    db.pragma('foreign_keys = ON');   // Enforce foreign key constraints
    db.pragma('synchronous = NORMAL'); // Balance between safety and performance
    db.pragma(`busy_timeout = ${DB_BUSY_TIMEOUT}`);  // Set busy timeout

    console.log(`✓ Connected to database: ${absolutePath}`);

    // Check if database has existing schema
    const schemaExists = isSchemaInitialized(db);

    if (schemaExists) {
      // Run all pending migrations using orchestrator
      // This handles upgrades from any version (v1.0.0, v1.1.x, v2.0.0, v2.1.x) to latest
      if (needsAnyMigrations(db)) {
        const migrationResults = runAllMigrations(db);

        // Check if any migration failed
        const failed = migrationResults.find(r => !r.success);
        if (failed) {
          console.error('\n❌ ERROR: Migration failed!');
          console.error(failed.message);
          db.close();
          process.exit(1);
        }

        // After table prefix migration, run schema initialization to create views/triggers
        // (tables already exist, CREATE TABLE IF NOT EXISTS will skip them)
        const hadPrefixMigration = migrationResults.some(r =>
          r.message.toLowerCase().includes('table prefix') ||
          r.message.toLowerCase().includes('prefix')
        );

        if (hadPrefixMigration) {
          console.log('\n→ Creating views and triggers for new schema...');
          initializeSchema(db);
        }
      }

      // Validate existing schema integrity (after migrations)
      console.log('→ Validating existing database schema...');
      const validation = verifySchemaIntegrity(db);

      if (!validation.valid) {
        // Schema is invalid - display error and exit
        console.error('\n❌ ERROR: Database schema validation failed!');
        console.error('\nThe existing database file has an incompatible schema.');
        console.error(`Database location: ${absolutePath}`);

        if (validation.missing.length > 0) {
          console.error('\n📋 Missing components:');
          validation.missing.forEach(item => console.error(`  - ${item}`));
        }

        if (validation.errors.length > 0) {
          console.error('\n⚠️  Validation errors:');
          validation.errors.forEach(error => console.error(`  - ${error}`));
        }

        console.error('\n💡 Possible solutions:');
        console.error('  1. Backup and delete the existing database file to start fresh');
        console.error('  2. Use a different database path with --db-path option');
        console.error('  3. Restore from a backup if available\n');

        // Close database and exit
        db.close();
        process.exit(1);
      }

      console.log('✓ Database schema validation passed');
    } else {
      // Initialize new schema
      console.log('→ Initializing database schema...');
      initializeSchema(db);
    }

    // Store instance
    dbInstance = db;

    // Perform initial cleanup
    try {
      const cleanupResult = performAutoCleanup(db);
      if (cleanupResult.messagesDeleted > 0 || cleanupResult.fileChangesDeleted > 0) {
        console.log(`✓ Cleanup: ${cleanupResult.messagesDeleted} messages, ${cleanupResult.fileChangesDeleted} file changes deleted`);
      }
    } catch (error) {
      console.warn('⚠️  Initial cleanup failed:', error instanceof Error ? error.message : String(error));
    }

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize database: ${message}`);
  }
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('✓ Database connection closed');
  }
}

/**
 * Get current database instance
 * Throws error if not initialized
 *
 * @returns Current database instance
 */
export function getDatabase(): DatabaseType {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
}

// ============================================================================
// Helper Functions for Master Table Management
// ============================================================================

/**
 * Get or create agent by name
 * Uses INSERT OR IGNORE for idempotent operation
 *
 * @param db - Database instance
 * @param name - Agent name
 * @returns Agent ID
 */
export function getOrCreateAgent(db: DatabaseType, name: string): number {
  // Try to insert
  db.prepare('INSERT OR IGNORE INTO m_agents (name) VALUES (?)').run(name);

  // Get the ID
  const result = db.prepare('SELECT id FROM m_agents WHERE name = ?').get(name) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create agent: ${name}`);
  }

  return result.id;
}

/**
 * Get or create context key by name
 *
 * @param db - Database instance
 * @param key - Context key name
 * @returns Context key ID
 */
export function getOrCreateContextKey(db: DatabaseType, key: string): number {
  db.prepare('INSERT OR IGNORE INTO m_context_keys (key) VALUES (?)').run(key);

  const result = db.prepare('SELECT id FROM m_context_keys WHERE key = ?').get(key) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create context key: ${key}`);
  }

  return result.id;
}

/**
 * Get or create file by path
 *
 * @param db - Database instance
 * @param path - File path
 * @returns File ID
 */
export function getOrCreateFile(db: DatabaseType, path: string): number {
  db.prepare('INSERT OR IGNORE INTO m_files (path) VALUES (?)').run(path);

  const result = db.prepare('SELECT id FROM m_files WHERE path = ?').get(path) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create file: ${path}`);
  }

  return result.id;
}

/**
 * Get or create tag by name
 *
 * @param db - Database instance
 * @param name - Tag name
 * @returns Tag ID
 */
export function getOrCreateTag(db: DatabaseType, name: string): number {
  db.prepare('INSERT OR IGNORE INTO m_tags (name) VALUES (?)').run(name);

  const result = db.prepare('SELECT id FROM m_tags WHERE name = ?').get(name) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create tag: ${name}`);
  }

  return result.id;
}

/**
 * Get or create scope by name
 *
 * @param db - Database instance
 * @param name - Scope name
 * @returns Scope ID
 */
export function getOrCreateScope(db: DatabaseType, name: string): number {
  db.prepare('INSERT OR IGNORE INTO m_scopes (name) VALUES (?)').run(name);

  const result = db.prepare('SELECT id FROM m_scopes WHERE name = ?').get(name) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create scope: ${name}`);
  }

  return result.id;
}

/**
 * Get or create category ID
 * Uses INSERT to create if doesn't exist
 *
 * @param db - Database instance
 * @param category - Category name
 * @returns Category ID
 */
export function getOrCreateCategoryId(db: DatabaseType, category: string): number {
  // Use INSERT OR IGNORE for idempotent operation
  db.prepare('INSERT OR IGNORE INTO m_constraint_categories (name) VALUES (?)').run(category);

  // Get the ID
  const result = db.prepare('SELECT id FROM m_constraint_categories WHERE name = ?').get(category) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create category: ${category}`);
  }

  return result.id;
}

/**
 * Get layer ID by name
 * Does not auto-create (layers are predefined)
 *
 * @param db - Database instance
 * @param name - Layer name
 * @returns Layer ID or null if not found
 */
export function getLayerId(db: DatabaseType, name: string): number | null {
  const result = db.prepare('SELECT id FROM m_layers WHERE name = ?').get(name) as { id: number } | undefined;
  return result ? result.id : null;
}

/**
 * Get constraint category ID by name
 * Does not auto-create (categories are predefined)
 *
 * @param db - Database instance
 * @param name - Category name
 * @returns Category ID or null if not found
 */
export function getCategoryId(db: DatabaseType, name: string): number | null {
  const result = db.prepare('SELECT id FROM m_constraint_categories WHERE name = ?').get(name) as { id: number } | undefined;
  return result ? result.id : null;
}

// ============================================================================
// Configuration Management
// ============================================================================

/**
 * Get configuration value from m_config table
 *
 * @param db - Database instance
 * @param key - Config key
 * @returns Config value as string or null if not found
 */
export function getConfigValue(db: DatabaseType, key: string): string | null {
  const result = db.prepare('SELECT value FROM m_config WHERE key = ?').get(key) as { value: string } | undefined;
  return result ? result.value : null;
}

/**
 * Set configuration value in m_config table
 *
 * @param db - Database instance
 * @param key - Config key
 * @param value - Config value (will be converted to string)
 */
export function setConfigValue(db: DatabaseType, key: string, value: string | number | boolean): void {
  const stringValue = String(value);
  db.prepare('INSERT OR REPLACE INTO m_config (key, value) VALUES (?, ?)').run(key, stringValue);
}

/**
 * Get configuration value as boolean
 *
 * @param db - Database instance
 * @param key - Config key
 * @param defaultValue - Default value if key not found
 * @returns Boolean value
 */
export function getConfigBool(db: DatabaseType, key: string, defaultValue: boolean = false): boolean {
  const value = getConfigValue(db, key);
  if (value === null) return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Get configuration value as integer
 *
 * @param db - Database instance
 * @param key - Config key
 * @param defaultValue - Default value if key not found
 * @returns Integer value
 */
export function getConfigInt(db: DatabaseType, key: string, defaultValue: number = 0): number {
  const value = getConfigValue(db, key);
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get all configuration as an object
 *
 * @param db - Database instance
 * @returns Object with all m_config key-value pairs
 */
export function getAllConfig(db: DatabaseType): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM m_config').all() as Array<{ key: string; value: string }>;
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Execute a function within a transaction
 * Automatically handles commit/rollback
 *
 * @param db - Database instance
 * @param fn - Function to execute in transaction
 * @returns Result from function
 */
export function transaction<T>(db: DatabaseType, fn: () => T): T {
  db.exec('BEGIN TRANSACTION');

  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ============================================================================
// Decision Context Management (v3.2.2)
// ============================================================================

/**
 * Validate JSON structure for alternatives array
 * @param alternatives - JSON string or null
 * @throws Error if JSON is invalid or not an array
 */
function validateAlternativesJson(alternatives: string | null): void {
  if (alternatives === null || alternatives === undefined) return;

  try {
    const parsed = JSON.parse(alternatives);
    if (!Array.isArray(parsed)) {
      throw new Error('alternatives_considered must be a JSON array');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('alternatives_considered contains invalid JSON');
    }
    throw error;
  }
}

/**
 * Validate JSON structure for tradeoffs object
 * @param tradeoffs - JSON string or null
 * @throws Error if JSON is invalid or doesn't have pros/cons structure
 */
function validateTradeoffsJson(tradeoffs: string | null): void {
  if (tradeoffs === null || tradeoffs === undefined) return;

  try {
    const parsed = JSON.parse(tradeoffs);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('tradeoffs must be a JSON object');
    }
    // Optional: Check for pros/cons keys if provided
    if (parsed.pros !== undefined && !Array.isArray(parsed.pros)) {
      throw new Error('tradeoffs.pros must be an array');
    }
    if (parsed.cons !== undefined && !Array.isArray(parsed.cons)) {
      throw new Error('tradeoffs.cons must be an array');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('tradeoffs contains invalid JSON');
    }
    throw error;
  }
}

/**
 * Add decision context to a decision
 *
 * @param db - Database instance
 * @param decisionKey - Decision key to attach context to
 * @param rationale - Rationale for the decision (required)
 * @param alternatives - JSON array of alternatives considered (optional)
 * @param tradeoffs - JSON object with pros/cons (optional)
 * @param decidedBy - Agent name who decided (optional)
 * @param relatedTaskId - Related task ID (optional)
 * @param relatedConstraintId - Related constraint ID (optional)
 * @returns Context ID
 */
export function addDecisionContext(
  db: DatabaseType,
  decisionKey: string,
  rationale: string,
  alternatives: string | null = null,
  tradeoffs: string | null = null,
  decidedBy: string | null = null,
  relatedTaskId: number | null = null,
  relatedConstraintId: number | null = null
): number {
  // Validate JSON inputs
  validateAlternativesJson(alternatives);
  validateTradeoffsJson(tradeoffs);

  // Get decision key ID
  const keyId = getOrCreateContextKey(db, decisionKey);

  // Get agent ID if provided
  let agentId: number | null = null;
  if (decidedBy) {
    agentId = getOrCreateAgent(db, decidedBy);
  }

  // Insert context
  const result = db.prepare(`
    INSERT INTO t_decision_context (
      decision_key_id,
      rationale,
      alternatives_considered,
      tradeoffs,
      decided_by_agent_id,
      related_task_id,
      related_constraint_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(keyId, rationale, alternatives, tradeoffs, agentId, relatedTaskId, relatedConstraintId);

  return result.lastInsertRowid as number;
}

/**
 * Get decision with context
 *
 * @param db - Database instance
 * @param decisionKey - Decision key
 * @returns Decision with context or null if not found
 */
export function getDecisionWithContext(db: DatabaseType, decisionKey: string): {
  key: string;
  value: string;
  version: string;
  status: string;
  layer: string | null;
  decided_by: string | null;
  updated: string;
  context: {
    id: number;
    rationale: string;
    alternatives_considered: string | null;
    tradeoffs: string | null;
    decided_by: string | null;
    decision_date: string;
    related_task_id: number | null;
    related_constraint_id: number | null;
  }[];
} | null {
  // First get the decision
  const decision = db.prepare(`
    SELECT
      k.key,
      d.value,
      d.version,
      CASE d.status WHEN 1 THEN 'active' WHEN 2 THEN 'deprecated' ELSE 'draft' END as status,
      l.name as layer,
      a.name as decided_by,
      datetime(d.ts, 'unixepoch') as updated
    FROM t_decisions d
    JOIN m_context_keys k ON d.key_id = k.id
    LEFT JOIN m_layers l ON d.layer_id = l.id
    LEFT JOIN m_agents a ON d.agent_id = a.id
    WHERE k.key = ?
  `).get(decisionKey) as {
    key: string;
    value: string;
    version: string;
    status: string;
    layer: string | null;
    decided_by: string | null;
    updated: string;
  } | undefined;

  if (!decision) return null;

  // Get all contexts for this decision
  const contexts = db.prepare(`
    SELECT
      dc.id,
      dc.rationale,
      dc.alternatives_considered,
      dc.tradeoffs,
      a.name as decided_by,
      datetime(dc.decision_date, 'unixepoch') as decision_date,
      dc.related_task_id,
      dc.related_constraint_id
    FROM t_decision_context dc
    JOIN m_context_keys k ON dc.decision_key_id = k.id
    LEFT JOIN m_agents a ON dc.decided_by_agent_id = a.id
    WHERE k.key = ?
    ORDER BY dc.decision_date DESC
  `).all(decisionKey) as Array<{
    id: number;
    rationale: string;
    alternatives_considered: string | null;
    tradeoffs: string | null;
    decided_by: string | null;
    decision_date: string;
    related_task_id: number | null;
    related_constraint_id: number | null;
  }>;

  return {
    ...decision,
    context: contexts,
  };
}

/**
 * List decision contexts with optional filters
 *
 * @param db - Database instance
 * @param filters - Optional filters
 * @returns Array of decision contexts
 */
export function listDecisionContexts(db: DatabaseType, filters?: {
  decisionKey?: string;
  relatedTaskId?: number;
  relatedConstraintId?: number;
  decidedBy?: string;
  limit?: number;
  offset?: number;
}): Array<{
  id: number;
  decision_key: string;
  rationale: string;
  alternatives_considered: string | null;
  tradeoffs: string | null;
  decided_by: string | null;
  decision_date: string;
  related_task_id: number | null;
  related_constraint_id: number | null;
}> {
  let query = `
    SELECT
      dc.id,
      k.key as decision_key,
      dc.rationale,
      dc.alternatives_considered,
      dc.tradeoffs,
      a.name as decided_by,
      datetime(dc.decision_date, 'unixepoch') as decision_date,
      dc.related_task_id,
      dc.related_constraint_id
    FROM t_decision_context dc
    JOIN m_context_keys k ON dc.decision_key_id = k.id
    LEFT JOIN m_agents a ON dc.decided_by_agent_id = a.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (filters?.decisionKey) {
    query += ' AND k.key = ?';
    params.push(filters.decisionKey);
  }

  if (filters?.relatedTaskId !== undefined) {
    query += ' AND dc.related_task_id = ?';
    params.push(filters.relatedTaskId);
  }

  if (filters?.relatedConstraintId !== undefined) {
    query += ' AND dc.related_constraint_id = ?';
    params.push(filters.relatedConstraintId);
  }

  if (filters?.decidedBy) {
    query += ' AND a.name = ?';
    params.push(filters.decidedBy);
  }

  query += ' ORDER BY dc.decision_date DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  if (filters?.offset) {
    query += ' OFFSET ?';
    params.push(filters.offset);
  }

  return db.prepare(query).all(...params) as Array<{
    id: number;
    decision_key: string;
    rationale: string;
    alternatives_considered: string | null;
    tradeoffs: string | null;
    decided_by: string | null;
    decision_date: string;
    related_task_id: number | null;
    related_constraint_id: number | null;
  }>;
}
