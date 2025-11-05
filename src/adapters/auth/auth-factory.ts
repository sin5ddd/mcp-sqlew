/**
 * @fileoverview Authentication Provider Factory
 *
 * Factory module for creating appropriate authentication providers based on database configuration.
 * Supports direct connections and future IAM-based authentication.
 *
 * **Note:** SSH tunneling is not supported. Users must set up SSH tunnels manually.
 *
 * @module adapters/auth/auth-factory
 */

import { BaseAuthProvider } from './base-auth-provider.js';
import { DirectAuthProvider } from './direct-auth-provider.js';
import type { DatabaseConfig } from '../../config/types.js';

/**
 * Create an authentication provider based on database configuration.
 *
 * Provider selection logic:
 * - SQLite: Returns null (no authentication needed for file-based database)
 * - MySQL/PostgreSQL: Returns DirectAuthProvider
 *
 * @param config - Database configuration
 * @returns Authentication provider instance or null for SQLite
 * @throws Error if database type is invalid
 *
 * @example
 * // Direct connection
 * const config: DatabaseConfig = {
 *   type: 'mysql',
 *   connection: {
 *     host: 'localhost',
 *     port: 3306,
 *     database: 'mydb'
 *   },
 *   auth: {
 *     type: 'direct',
 *     user: 'dbuser',
 *     password: 'dbpass'
 *   }
 * };
 * const provider = createAuthProvider(config);
 * // Returns DirectAuthProvider instance
 *
 * @example
 * // Connection via manual SSH tunnel
 * // Step 1: Set up tunnel manually:
 * //   ssh -L 3307:db.internal.company.com:3306 user@bastion.example.com
 * // Step 2: Configure to use localhost:
 * const config: DatabaseConfig = {
 *   type: 'mysql',
 *   connection: {
 *     host: 'localhost',  // Tunnel endpoint
 *     port: 3307,         // Forwarded port
 *     database: 'mydb'
 *   },
 *   auth: {
 *     type: 'direct',
 *     user: 'dbuser',
 *     password: 'dbpass'
 *   }
 * };
 * const provider = createAuthProvider(config);
 * // Returns DirectAuthProvider for localhost connection
 *
 * @example
 * // SQLite (no authentication)
 * const sqliteConfig: DatabaseConfig = {
 *   type: 'sqlite',
 *   path: './data.db'
 * };
 * const provider = createAuthProvider(sqliteConfig);
 * // Returns null
 */
export function createAuthProvider(config: DatabaseConfig): BaseAuthProvider | null {
  // Validate database type
  if (!config.type) {
    throw new Error('Database type is required in configuration');
  }

  const validTypes = ['sqlite', 'mysql', 'postgres'];
  if (!validTypes.includes(config.type)) {
    throw new Error(`Invalid database type: ${config.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // SQLite doesn't need authentication (file-based)
  if (config.type === 'sqlite') {
    return null;
  }

  // MySQL/PostgreSQL use direct authentication
  // (Users must set up SSH tunnels manually if needed)
  return new DirectAuthProvider(config);
}

/**
 * Check if database type requires authentication.
 *
 * @param config - Database configuration
 * @returns True if authentication is required (MySQL/PostgreSQL)
 *
 * @example
 * if (requiresAuthentication(config)) {
 *   const provider = createAuthProvider(config);
 *   await provider!.authenticate();
 * }
 */
export function requiresAuthentication(config: DatabaseConfig): boolean {
  return config.type !== 'sqlite';
}
