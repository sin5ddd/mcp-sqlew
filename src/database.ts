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
      // Validate existing schema integrity
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
  db.prepare('INSERT OR IGNORE INTO agents (name) VALUES (?)').run(name);

  // Get the ID
  const result = db.prepare('SELECT id FROM agents WHERE name = ?').get(name) as { id: number } | undefined;

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
  db.prepare('INSERT OR IGNORE INTO context_keys (key) VALUES (?)').run(key);

  const result = db.prepare('SELECT id FROM context_keys WHERE key = ?').get(key) as { id: number } | undefined;

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
  db.prepare('INSERT OR IGNORE INTO files (path) VALUES (?)').run(path);

  const result = db.prepare('SELECT id FROM files WHERE path = ?').get(path) as { id: number } | undefined;

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
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);

  const result = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number } | undefined;

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
  db.prepare('INSERT OR IGNORE INTO scopes (name) VALUES (?)').run(name);

  const result = db.prepare('SELECT id FROM scopes WHERE name = ?').get(name) as { id: number } | undefined;

  if (!result) {
    throw new Error(`Failed to get or create scope: ${name}`);
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
  const result = db.prepare('SELECT id FROM layers WHERE name = ?').get(name) as { id: number } | undefined;
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
  const result = db.prepare('SELECT id FROM constraint_categories WHERE name = ?').get(name) as { id: number } | undefined;
  return result ? result.id : null;
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
