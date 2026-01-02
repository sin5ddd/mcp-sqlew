/**
 * Database initialization module
 */

import type { DatabaseAdapter } from '../../adapters/index.js';
import { createDatabaseAdapter } from '../../adapters/index.js';
import { syncAgentsWithConfig } from '../../sync-agents.js';
import { syncCommandsWithConfig } from '../../sync-commands.js';
import { syncGitignore } from '../../sync-gitignore.js';
import { debugLog } from '../../utils/debug-logger.js';
import knexConfig from '../../knexfile.js';
import { detectSchemaVersion, getSchemaVersion } from './schema-version.js';

// Global adapter instance
let adapterInstance: DatabaseAdapter | null = null;

/**
 * Initialize database with adapter pattern
 */
export async function initializeDatabase(
  config?: {
    databaseType?: 'sqlite' | 'postgresql' | 'mysql';
    connection?: any;
    configPath?: string;
  }
): Promise<DatabaseAdapter> {
  if (adapterInstance) {
    return adapterInstance;
  }

  const dbType = config?.databaseType || 'sqlite';

  // Build DatabaseConfig for adapter
  // For MySQL/PostgreSQL, use provided connection config with auth
  // For SQLite, use traditional file path
  const databaseConfig = config?.connection
    ? ({
        type: (dbType === 'postgresql' ? 'postgres' : dbType) as 'sqlite' | 'mysql' | 'postgres',
        connection: config.connection,
        auth: config.connection.user
          ? {
              type: 'direct' as const,
              user: config.connection.user,
              password: config.connection.password,
            }
          : undefined,
      } as const)
    : undefined;

  const adapter = createDatabaseAdapter(dbType, databaseConfig as any);

  // Determine if running from compiled code (dist/) or source (src/)
  const isCompiledCode = import.meta.url.includes('/dist/');
  const environment = isCompiledCode ? 'production' : 'development';

  // Use config from knexfile or provided config
  const baseConfig = knexConfig[environment] || knexConfig.development;
  const knexConnConfig = config?.connection
    ? { ...baseConfig, connection: config.connection }
    : baseConfig;

  // Note: adapter.connect() uses this.config internally (set in constructor)
  // The knexConnConfig here is primarily for TypeScript and backward compatibility
  await adapter.connect(knexConnConfig);

  // Run migrations if needed
  const knex = adapter.getKnex();

  // Extract migrations config from baseConfig and pass to migrate()
  const migrationsConfig = baseConfig.migrations || {};

  // Clear v3 migration history before running v4 migrations
  // This allows v4-only migration directory without "missing files" errors
  try {
    const hasKnexMigrations = await knex.schema.hasTable('knex_migrations');
    if (hasKnexMigrations) {
      // Delete only v3 migration records (timestamps before 20251126)
      // v4 migrations: 20251126 and later (20251127, 20260102, etc.)
      const deleted = await knex('knex_migrations')
        .where('name', '<', '20251126')
        .delete();
      if (deleted > 0) {
        debugLog('INFO', `Cleared ${deleted} obsolete v3 migration records from knex_migrations`);
      }
    }
  } catch (cleanupError: any) {
    // Non-fatal: log and continue
    debugLog('WARN', `Failed to cleanup v3 migration history: ${cleanupError.message}`);
  }

  try {
    await knex.migrate.latest(migrationsConfig);
  } catch (migrationError: any) {
    // Log migration error to debug log (if initialized) and stderr
    const errorMessage = `Migration failed: ${migrationError.message || String(migrationError)}`;
    debugLog('ERROR', errorMessage, {
      error: migrationError,
      stack: migrationError.stack
    });

    // Re-throw with more context
    const enhancedError = new Error(errorMessage);
    enhancedError.cause = migrationError;
    throw enhancedError;
  }

  debugLog('INFO', `Database initialized with Knex adapter (${environment})`);

  // Detect schema version (v3 vs v4)
  const schemaVersionInfo = await detectSchemaVersion(knex);
  debugLog('INFO', 'Schema version detection complete', {
    version: schemaVersionInfo.version,
    hasV4Tables: schemaVersionInfo.hasV4Tables,
    hasV3Tables: schemaVersionInfo.hasV3Tables,
    tablePrefix: schemaVersionInfo.tablePrefix,
  });

  // Sync agents with config.toml
  syncAgentsWithConfig();

  // Sync commands with config.toml
  syncCommandsWithConfig();

  // Sync .gitignore with sqlew system patterns
  syncGitignore();

  adapterInstance = adapter;
  return adapter;
}

/**
 * Get current database adapter instance
 */
export function getAdapterInstance(): DatabaseAdapter | null {
  return adapterInstance;
}

/**
 * Set adapter instance (for testing)
 */
export function setAdapterInstance(adapter: DatabaseAdapter | null): void {
  adapterInstance = adapter;
}
