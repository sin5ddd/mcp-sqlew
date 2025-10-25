// src/adapters/index.ts
// Export types from separate file to avoid circular dependencies
export type { DatabaseAdapter } from './types.js';

// Import adapter implementations
import { SQLiteAdapter } from './sqlite-adapter.js';
import { PostgreSQLAdapter } from './postgresql-adapter.js';
import { MySQLAdapter } from './mysql-adapter.js';
import type { DatabaseAdapter } from './types.js';

export { SQLiteAdapter, PostgreSQLAdapter, MySQLAdapter };

/**
 * Factory function to create database adapter
 */
export function createDatabaseAdapter(
  databaseType: 'sqlite' | 'postgresql' | 'mysql'
): DatabaseAdapter {
  switch (databaseType) {
    case 'sqlite':
      return new SQLiteAdapter();
    case 'postgresql':
      return new PostgreSQLAdapter();
    case 'mysql':
      return new MySQLAdapter();
    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
}
