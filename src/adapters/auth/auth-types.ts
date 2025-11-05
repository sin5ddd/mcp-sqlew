/**
 * @fileoverview Type definitions for authentication system.
 *
 * @deprecated This file has been deprecated as of v3.7.0.
 * All authentication types have been integrated into the main configuration system.
 *
 * **Migration Path:**
 * - OLD: `import type { DatabaseConfig } from './adapters/auth/auth-types.js'`
 * - NEW: `import type { DatabaseConfig } from './config/types.js'`
 *
 * **Available Types in config/types.ts:**
 * - `DatabaseConfig` - Main database configuration interface
 * - `AuthConfig` - Authentication configuration (direct, aws-iam, gcp-iam)
 * - `SSLConfig` - SSL/TLS configuration
 * - `ConnectionConfig` - Database connection parameters
 *
 * **Note:** SSH authentication has been removed. Users must set up SSH tunnels manually.
 *
 * This file is kept for backward compatibility during the transition period
 * and will be removed in v3.8.0. Please update your imports to use `config/types.ts`.
 *
 * **Completed in Task P6.1 #72**
 *
 * @module adapters/auth/auth-types
 * @since v3.7.0
 * @deprecated Use config/types.ts instead
 * @internal
 */

// Re-export types from the new centralized location for backward compatibility
// All new code should import directly from '../../config/types.js'
export type {
  SSLConfig,
  AuthConfig,
  ConnectionConfig,
  DatabaseConfig
} from '../../config/types.js';
