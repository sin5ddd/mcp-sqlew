// src/adapters/index.ts
// Export types from separate file to avoid circular dependencies
export type { DatabaseAdapter } from './types.js';
export type { DatabaseConfig, AuthConfig, SSLConfig, ConnectionConfig } from '../config/types.js';

// Export base adapter
export { BaseAdapter } from './base-adapter.js';

// Import adapter implementations
import { SQLiteAdapter } from './sqlite-adapter.js';
import { PostgreSQLAdapter } from './postgresql-adapter.js';
import { MySQLAdapter } from './mysql-adapter.js';
import type { DatabaseAdapter } from './types.js';
import type { DatabaseConfig } from '../config/types.js';

export { SQLiteAdapter, PostgreSQLAdapter, MySQLAdapter };

/**
 * Factory function to create database adapter.
 *
 * NOTE: This factory maintains backward compatibility with the old signature
 * that only accepts database type. For new code with authentication, create
 * adapters directly with DatabaseConfig.
 *
 * @param databaseType - Database type identifier
 * @param config - Optional database configuration (for new auth-aware code)
 * @returns Database adapter instance
 */
export function createDatabaseAdapter(
  databaseType: 'sqlite' | 'postgresql' | 'mysql',
  config?: DatabaseConfig
): DatabaseAdapter {
  // Build default config if not provided (backward compatibility)
  const defaultConfig: DatabaseConfig = config || {
    type: databaseType === 'postgresql' ? 'postgres' : databaseType,
    connection: {
      host: '',
      port: 0,
      database: '',
    },
    auth: {
      type: 'direct',
    },
  };

  switch (databaseType) {
    case 'sqlite':
      return new SQLiteAdapter(defaultConfig);
    case 'postgresql':
      return new PostgreSQLAdapter(defaultConfig);
    case 'mysql':
      return new MySQLAdapter(defaultConfig);
    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
}
