/**
 * Database initialization module
 */

import type { DatabaseAdapter } from '../../adapters/index.js';
import { createDatabaseAdapter } from '../../adapters/index.js';
import { syncAgentsWithConfig } from '../../sync-agents.js';
import { debugLog } from '../../utils/debug-logger.js';
import knexConfig from '../../knexfile.js';

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

  // Sync agents with config.toml
  syncAgentsWithConfig();

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
