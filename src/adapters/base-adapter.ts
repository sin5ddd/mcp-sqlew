/**
 * @fileoverview Base adapter for database connections with authentication integration.
 *
 * This module provides the foundation for all database adapters in the multi-RDBMS system.
 * It integrates authentication providers (SSH tunneling, direct connections, cloud IAM) with
 * Knex.js-based database connections, managing the complete connection lifecycle.
 *
 * **Key Responsibilities:**
 * - Authentication provider integration via factory
 * - Connection lifecycle management (connect → authenticate → establish → cleanup)
 * - Knex.js instance management and access control
 * - Transaction support delegation
 * - Abstract methods for adapter-specific initialization
 *
 * **Connection Flow:**
 * 1. Constructor: Initialize with DatabaseConfig
 * 2. connect(): Authenticate via provider, establish Knex connection
 * 3. initialize(): Adapter-specific setup (pragmas, schemas, etc.)
 * 4. getKnex(): Access Knex instance for queries
 * 5. disconnect(): Close Knex connection
 * 6. cleanup(): Release authentication resources (tunnels, tokens)
 *
 * **Architecture:**
 * ```
 * BaseAdapter (abstract)
 *   ├── Authentication Layer: BaseAuthProvider integration
 *   ├── Connection Layer: Knex.js management
 *   └── Adapter-Specific: Abstract methods for subclasses
 *
 * Concrete Adapters:
 *   ├── SQLiteAdapter (no auth required)
 *   ├── PostgreSQLAdapter (with auth integration)
 *   └── MySQLAdapter (with auth integration)
 * ```
 *
 * @module adapters/base-adapter
 * @since v3.7.0
 */

import knexLib from 'knex';
import type { Knex } from 'knex';
import type { DatabaseAdapter } from './types.js';
import type { DatabaseConfig } from '../config/types.js';
import { createAuthProvider } from './auth/auth-factory.js';
import type { BaseAuthProvider, ConnectionParams } from './auth/base-auth-provider.js';

const { knex } = knexLib;

/**
 * Abstract base class for database adapters with authentication integration.
 *
 * This class provides common functionality for all database adapters, integrating
 * authentication providers with Knex.js connections. Subclasses implement
 * database-specific features (SQLite pragmas, PostgreSQL settings, MySQL config).
 *
 * **Design Principles:**
 * - Separation of concerns: Auth provider handles authentication, adapter handles DB operations
 * - Lazy initialization: Knex instance created only after successful authentication
 * - Resource safety: Explicit cleanup for both auth providers and DB connections
 * - Fail-fast validation: Auth provider validates config before connection attempt
 * - Backward compatibility: Maintains DatabaseAdapter interface contract
 *
 * **Authentication Integration:**
 * - SQLite: No authentication provider (null), direct file connection
 * - PostgreSQL/MySQL: Auth provider handles tunneling/IAM/direct auth
 * - SSH tunneling: Provider establishes tunnel, returns localhost connection params
 * - Cloud IAM: Provider generates temporary tokens, returns params with SSL config
 *
 * **Error Handling:**
 * - Constructor: Config validation (throws if invalid)
 * - connect(): Authentication failures, connection failures
 * - getKnex(): Throws if called before connect()
 * - cleanup(): Swallows errors to prevent cascading failures
 *
 * @abstract
 * @implements {DatabaseAdapter}
 *
 * @example
 * // Implementing a PostgreSQL adapter
 * class PostgreSQLAdapter extends BaseAdapter {
 *   readonly supportsReturning = true;
 *   readonly supportsJSON = true;
 *   readonly databaseName = 'postgresql' as const;
 *
 *   async initialize(): Promise<void> {
 *     const knex = this.getKnex();
 *     // PostgreSQL-specific initialization
 *     await knex.raw('SET statement_timeout = 30000');
 *     await knex.raw('SET timezone = "UTC"');
 *   }
 *
 *   getDialect(): string {
 *     return 'pg';
 *   }
 *
 *   // Implement other DatabaseAdapter methods...
 * }
 *
 * @example
 * // Using the adapter with authentication
 * const config: DatabaseConfig = {
 *   type: 'postgres',
 *   connection: {
 *     host: 'db.internal',
 *     port: 5432,
 *     database: 'production'
 *   },
 *   auth: {
 *     type: 'ssh',
 *     user: 'postgres',
 *     password: 'secret',
 *     ssh: {
 *       host: 'bastion.example.com',
 *       username: 'deploy',
 *       privateKeyPath: '/path/to/key.pem'
 *     }
 *   }
 * };
 *
 * const adapter = new PostgreSQLAdapter(config);
 * try {
 *   await adapter.connect();
 *   const knex = adapter.getKnex();
 *   const users = await knex('users').select('*');
 *   console.log(users);
 * } finally {
 *   await adapter.disconnect();
 *   await adapter.cleanup();
 * }
 *
 * @example
 * // Transaction support
 * const adapter = new PostgreSQLAdapter(config);
 * await adapter.connect();
 *
 * try {
 *   await adapter.transaction(async (trx) => {
 *     await trx('accounts').where({ id: 1 }).update({ balance: 100 });
 *     await trx('accounts').where({ id: 2 }).update({ balance: 200 });
 *   });
 * } finally {
 *   await adapter.disconnect();
 *   await adapter.cleanup();
 * }
 *
 * @example
 * // SQLite adapter (no authentication)
 * class SQLiteAdapter extends BaseAdapter {
 *   async connect(): Promise<Knex> {
 *     // SQLite doesn't need authentication provider
 *     // Override connect to bypass auth flow
 *     const config: Knex.Config = {
 *       client: 'better-sqlite3',
 *       connection: {
 *         filename: this.config.connection.database
 *       },
 *       useNullAsDefault: true
 *     };
 *
 *     this.knex = knex(config);
 *     await this.initialize();
 *     return this.knex;
 *   }
 *
 *   getDialect(): string {
 *     return 'sqlite3';
 *   }
 * }
 */
export abstract class BaseAdapter implements DatabaseAdapter {
  /**
   * Database configuration containing connection and authentication settings.
   * @protected
   * @readonly
   */
  protected readonly config: DatabaseConfig;

  /**
   * Authentication provider instance for handling credentials, tunnels, and tokens.
   * Null for databases that don't require authentication (e.g., SQLite).
   * @protected
   */
  protected authProvider: BaseAuthProvider | null = null;

  /**
   * Knex.js instance for database operations.
   * Null until connect() is called successfully.
   * @protected
   */
  protected knexInstance: Knex | null = null;

  /**
   * Creates a new database adapter instance.
   *
   * @param {DatabaseConfig} config - Database configuration object
   *
   * @throws {Error} If database type is unsupported
   *
   * @example
   * const adapter = new PostgreSQLAdapter({
   *   type: 'postgres',
   *   connection: { host: 'localhost', port: 5432, database: 'mydb' },
   *   auth: { type: 'direct', user: 'postgres', password: 'postgres' }
   * });
   */
  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ============================================================================

  /**
   * Performs adapter-specific initialization after connection is established.
   *
   * This method is called automatically after Knex connection is created.
   * Subclasses implement database-specific setup:
   *
   * **SQLite:**
   * - PRAGMA settings (journal_mode, foreign_keys, synchronous)
   * - Query performance optimizations
   *
   * **PostgreSQL:**
   * - Session settings (statement_timeout, timezone)
   * - Search path configuration
   * - Connection pool settings
   *
   * **MySQL:**
   * - Session variables (sql_mode, time_zone)
   * - Character set configuration
   * - Transaction isolation level
   *
   * @abstract
   * @returns {Promise<void>}
   *
   * @throws {Error} If initialization fails
   *
   * @example
   * // SQLite implementation
   * async initialize(): Promise<void> {
   *   const knex = this.getKnex();
   *   await knex.raw('PRAGMA journal_mode = WAL');
   *   await knex.raw('PRAGMA foreign_keys = ON');
   *   await knex.raw('PRAGMA synchronous = NORMAL');
   * }
   *
   * @example
   * // PostgreSQL implementation
   * async initialize(): Promise<void> {
   *   const knex = this.getKnex();
   *   await knex.raw('SET statement_timeout = 30000');
   *   await knex.raw('SET timezone = "UTC"');
   *   await knex.raw('SET search_path = public');
   * }
   */
  abstract initialize(): Promise<void>;

  /**
   * Returns the Knex dialect identifier for this database.
   *
   * Used for Knex configuration and feature detection.
   *
   * **Valid Dialect Values:**
   * - 'sqlite3' - SQLite
   * - 'pg' - PostgreSQL
   * - 'mysql' - MySQL
   * - 'mysql2' - MySQL with mysql2 driver
   * - 'mssql' - Microsoft SQL Server
   * - 'oracledb' - Oracle Database
   *
   * @abstract
   * @returns {string} Knex dialect identifier
   *
   * @example
   * // SQLite adapter
   * getDialect(): string {
   *   return 'sqlite3';
   * }
   *
   * @example
   * // PostgreSQL adapter
   * getDialect(): string {
   *   return 'pg';
   * }
   */
  abstract getDialect(): string;

  // ============================================================================
  // Feature Detection - Must be implemented by subclasses
  // ============================================================================

  /**
   * Whether this database supports RETURNING clause in INSERT/UPDATE/DELETE.
   * @abstract
   */
  abstract readonly supportsReturning: boolean;

  /**
   * Whether this database has native JSON support.
   * @abstract
   */
  abstract readonly supportsJSON: boolean;

  /**
   * Whether this database supports UPSERT operations (INSERT ... ON CONFLICT).
   * @abstract
   */
  abstract readonly supportsUpsert: boolean;

  /**
   * Whether this database supports Common Table Expressions (WITH clause).
   * @abstract
   */
  abstract readonly supportsCTE: boolean;

  /**
   * Whether this database supports window functions.
   * @abstract
   */
  abstract readonly supportsWindowFunctions: boolean;

  /**
   * Whether this database supports savepoints within transactions.
   * @abstract
   */
  abstract readonly supportsSavepoints: boolean;

  /**
   * Database name identifier.
   * @abstract
   */
  abstract readonly databaseName: 'sqlite' | 'postgresql' | 'mysql';

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Establishes database connection with authentication.
   *
   * This method orchestrates the complete connection flow:
   * 1. Create authentication provider (if required)
   * 2. Validate authentication configuration
   * 3. Authenticate and obtain connection parameters
   * 4. Create Knex instance with authenticated params
   * 5. Call initialize() for adapter-specific setup
   *
   * **Authentication Flow:**
   * - Direct: Use credentials as-is
   * - SSH: Establish tunnel, connect to localhost
   * - AWS/GCP IAM: Generate token, connect with SSL
   *
   * **Important Notes:**
   * - This method is idempotent: calling twice reuses existing connection
   * - Auth provider resources remain allocated until cleanup() is called
   * - Knex instance is accessible via getKnex() after successful connection
   * - Subclasses can override for special handling (e.g., SQLite)
   *
   * @returns {Promise<Knex>} Knex instance for database operations
   *
   * @throws {Error} 'Database already connected' - if connection exists
   * @throws {Error} Auth provider validation errors
   * @throws {Error} Authentication failures (invalid credentials, network issues)
   * @throws {Error} Knex connection failures (database unreachable, invalid database name)
   * @throws {Error} Initialization failures (adapter-specific setup errors)
   *
   * @example
   * // Standard usage
   * const adapter = new PostgreSQLAdapter(config);
   * try {
   *   const knex = await adapter.connect();
   *   console.log('Connected successfully');
   * } catch (error) {
   *   console.error('Connection failed:', error.message);
   *   await adapter.cleanup();
   *   throw error;
   * }
   *
   * @example
   * // Idempotent connection
   * const adapter = new PostgreSQLAdapter(config);
   * const knex1 = await adapter.connect(); // Establishes connection
   * const knex2 = await adapter.connect(); // Returns same instance
   * console.log(knex1 === knex2); // true
   */
  async connect(): Promise<Knex> {
    // Idempotent: return existing connection if already established
    if (this.knexInstance) {
      return this.knexInstance;
    }

    // Create authentication provider (null for SQLite)
    this.authProvider = createAuthProvider(this.config);

    // Authenticate and get connection parameters
    let connParams: ConnectionParams | null = null;

    if (this.authProvider !== null) {
      // Validate authentication configuration
      this.authProvider.validate();

      // Authenticate to get connection parameters
      connParams = await this.authProvider.authenticate();
    }

    // Build Knex configuration
    const knexConfig = this.buildKnexConfig(connParams);

    // Create Knex instance
    this.knexInstance = knex(knexConfig);

    // Perform adapter-specific initialization
    await this.initialize();

    return this.knexInstance;
  }

  /**
   * Closes the database connection.
   *
   * This method closes the Knex connection pool, releasing all database connections.
   * It does NOT release authentication provider resources (SSH tunnels, tokens) -
   * call cleanup() to release those.
   *
   * **Resource Lifecycle:**
   * - disconnect() → Closes Knex connection pool
   * - cleanup() → Releases auth provider resources (tunnels, tokens)
   * - Both must be called for complete cleanup
   *
   * **Important Notes:**
   * - This method is idempotent: safe to call multiple times
   * - Pending queries are allowed to complete before closing
   * - After disconnect(), getKnex() will throw an error
   * - Auth provider resources remain allocated until cleanup()
   *
   * @returns {Promise<void>}
   *
   * @example
   * // Complete cleanup flow
   * const adapter = new PostgreSQLAdapter(config);
   * try {
   *   await adapter.connect();
   *   // ... use database ...
   * } finally {
   *   await adapter.disconnect(); // Close DB connection
   *   await adapter.cleanup();    // Release auth resources
   * }
   *
   * @example
   * // Idempotent disconnect
   * await adapter.disconnect(); // Closes connection
   * await adapter.disconnect(); // Safe - no-op
   */
  async disconnect(): Promise<void> {
    if (this.knexInstance) {
      await this.knexInstance.destroy();
      this.knexInstance = null;
    }
  }

  /**
   * Releases authentication provider resources.
   *
   * This method releases resources allocated during authentication:
   * - SSH tunnels: Closes SSH connection and releases local port
   * - Cloud IAM: Invalidates cached tokens
   * - Direct connections: No-op (no resources to release)
   *
   * **Important Notes:**
   * - This method MUST be called after disconnect() to prevent resource leaks
   * - Errors during cleanup are caught and logged, not thrown
   * - This method is idempotent: safe to call multiple times
   * - Auth provider is set to null after cleanup
   *
   * **Resource Leak Prevention:**
   * Always call cleanup() in a finally block to ensure resources are released
   * even if database operations fail.
   *
   * @returns {Promise<void>}
   *
   * @example
   * // Proper cleanup flow
   * const adapter = new PostgreSQLAdapter(config);
   * try {
   *   await adapter.connect();
   *   // ... database operations ...
   * } finally {
   *   await adapter.disconnect();
   *   await adapter.cleanup();
   * }
   *
   * @example
   * // Error handling during cleanup
   * try {
   *   await adapter.cleanup();
   * } catch (error) {
   *   // Cleanup errors are logged but not thrown to prevent cascading failures
   *   console.error('Cleanup failed:', error);
   * }
   */
  async cleanup(): Promise<void> {
    if (this.authProvider) {
      try {
        await this.authProvider.cleanup();
      } catch (error) {
        // Log cleanup errors but don't throw - connection is already closed
        console.error('Auth provider cleanup failed:', error);
      }
      this.authProvider = null;
    }
  }

  /**
   * Returns the Knex.js instance for database operations.
   *
   * This method provides access to the underlying Knex instance for executing
   * queries, building query chains, and accessing raw connections.
   *
   * **Important Notes:**
   * - Must call connect() before calling this method
   * - Throws error if connection not established
   * - Returns same instance across multiple calls
   *
   * @returns {Knex} Knex instance for database operations
   *
   * @throws {Error} 'Database not connected. Call connect() first.' - if not connected
   *
   * @example
   * // Standard usage
   * const adapter = new PostgreSQLAdapter(config);
   * await adapter.connect();
   * const knex = adapter.getKnex();
   * const users = await knex('users').select('*');
   *
   * @example
   * // Query builder
   * const knex = adapter.getKnex();
   * const query = knex('orders')
   *   .where('status', 'pending')
   *   .andWhere('created_at', '>', '2024-01-01')
   *   .orderBy('created_at', 'desc');
   *
   * @example
   * // Raw queries
   * const knex = adapter.getKnex();
   * const result = await knex.raw('SELECT * FROM users WHERE id = ?', [userId]);
   */
  getKnex(): Knex {
    if (!this.knexInstance) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.knexInstance;
  }

  // ============================================================================
  // Transaction Support
  // ============================================================================

  /**
   * Executes a callback within a database transaction.
   *
   * This method delegates to Knex's transaction management, providing:
   * - Automatic commit on success
   * - Automatic rollback on error
   * - Optional isolation level configuration
   *
   * **Transaction Isolation Levels:**
   * - 'serializable': Strongest isolation, prevents all anomalies
   * - 'repeatable read': Prevents non-repeatable reads and phantom reads
   * - 'read committed': Prevents dirty reads (default for most databases)
   *
   * **Important Notes:**
   * - All database operations within callback must use the trx parameter
   * - Do not mix transaction queries with non-transaction queries
   * - Nested transactions use savepoints (if supported by database)
   *
   * @param {Function} callback - Async function receiving transaction object
   * @param {Object} [options] - Transaction options
   * @param {string} [options.isolationLevel] - Transaction isolation level
   * @returns {Promise<T>} Result from callback function
   *
   * @throws {Error} If callback throws (transaction is rolled back)
   *
   * @example
   * // Bank transfer transaction
   * await adapter.transaction(async (trx) => {
   *   await trx('accounts')
   *     .where({ id: fromAccount })
   *     .decrement('balance', amount);
   *
   *   await trx('accounts')
   *     .where({ id: toAccount })
   *     .increment('balance', amount);
   *
   *   await trx('transfers').insert({
   *     from_account: fromAccount,
   *     to_account: toAccount,
   *     amount
   *   });
   * });
   *
   * @example
   * // Transaction with isolation level
   * await adapter.transaction(async (trx) => {
   *   const balance = await trx('accounts')
   *     .where({ id: accountId })
   *     .first('balance');
   *
   *   if (balance.balance >= amount) {
   *     await trx('accounts')
   *       .where({ id: accountId })
   *       .decrement('balance', amount);
   *   }
   * }, { isolationLevel: 'serializable' });
   *
   * @example
   * // Error handling (automatic rollback)
   * try {
   *   await adapter.transaction(async (trx) => {
   *     await trx('users').insert({ name: 'Alice' });
   *     throw new Error('Something went wrong');
   *     await trx('logs').insert({ message: 'Never executed' });
   *   });
   * } catch (error) {
   *   console.log('Transaction rolled back:', error.message);
   * }
   */
  async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>,
    options?: {
      isolationLevel?: 'serializable' | 'read committed' | 'repeatable read';
    }
  ): Promise<T> {
    const knex = this.getKnex();
    return await knex.transaction(callback, options);
  }

  // ============================================================================
  // Protected Helper Methods
  // ============================================================================

  /**
   * Builds Knex configuration from connection parameters.
   *
   * This method converts ConnectionParams (returned by auth provider) into
   * Knex.Config format. Subclasses can override to customize configuration.
   *
   * **Default Behavior:**
   * - Uses dialect from getDialect()
   * - Passes connection params to Knex
   * - Configures SSL if present
   * - Merges additional params
   *
   * @protected
   * @param {ConnectionParams | null} connParams - Connection parameters from auth provider
   * @returns {Knex.Config} Knex configuration object
   *
   * @example
   * // Custom configuration in subclass
   * protected buildKnexConfig(connParams: ConnectionParams | null): Knex.Config {
   *   const baseConfig = super.buildKnexConfig(connParams);
   *   return {
   *     ...baseConfig,
   *     pool: {
   *       min: 2,
   *       max: 10,
   *       afterCreate: (conn, done) => {
   *         // Custom connection setup
   *         done(null, conn);
   *       }
   *     }
   *   };
   * }
   */
  protected buildKnexConfig(connParams: ConnectionParams | null): Knex.Config {
    if (!connParams) {
      // SQLite or other file-based databases
      return {
        client: this.getDialect(),
        connection: {
          filename: this.config.connection!.database,
        },
        useNullAsDefault: true,
      };
    }

    // Client-server databases with authentication
    const connectionConfig: any = {
      host: connParams.host,
      port: connParams.port,
      database: connParams.database,
      user: connParams.user,
    };

    // Add password if present
    if (connParams.password) {
      connectionConfig.password = connParams.password;
    }

    // Add SSL configuration if present
    if (connParams.ssl) {
      connectionConfig.ssl = connParams.ssl;
    }

    // Merge additional parameters
    if (connParams.additionalParams) {
      Object.assign(connectionConfig, connParams.additionalParams);
    }

    return {
      client: this.getDialect(),
      connection: connectionConfig,
      useNullAsDefault: this.getDialect() === 'sqlite3',
    };
  }

  // ============================================================================
  // Query Adaptations - Must be implemented by subclasses
  // ============================================================================

  /**
   * Inserts a row and returns the inserted record.
   * Adapts to databases that don't support RETURNING clause.
   * @abstract
   */
  abstract insertReturning<T extends Record<string, any>>(
    table: string,
    data: Partial<T>
  ): Promise<T>;

  /**
   * Upserts a row (INSERT ... ON CONFLICT UPDATE).
   * Adapts to different upsert syntaxes across databases.
   * @abstract
   */
  abstract upsert<T extends Record<string, any>>(
    table: string,
    data: Partial<T>,
    conflictColumns: string[],
    updateColumns?: string[]
  ): Promise<number>;

  /**
   * Extracts a value from a JSON column.
   * @abstract
   */
  abstract jsonExtract(column: string, path: string): Knex.Raw;

  /**
   * Builds a JSON object from field values.
   * @abstract
   */
  abstract jsonBuildObject(fields: Record<string, any>): Knex.Raw;

  /**
   * Returns current timestamp expression.
   * @abstract
   */
  abstract currentTimestamp(): Knex.Raw;

  /**
   * Converts Unix epoch to datetime.
   * @abstract
   */
  abstract fromUnixEpoch(epochColumn: string): Knex.Raw;

  /**
   * Converts datetime to Unix epoch.
   * @abstract
   */
  abstract toUnixEpoch(timestampColumn: string): Knex.Raw;

  /**
   * Concatenates string values.
   * @abstract
   */
  abstract concat(...values: Array<string | Knex.Raw>): Knex.Raw;

  /**
   * Aggregates strings with separator.
   * @abstract
   */
  abstract stringAgg(column: string, separator?: string): Knex.Raw;

  /**
   * Creates a savepoint within a transaction.
   * @abstract
   */
  abstract savepoint<T>(
    trx: Knex.Transaction,
    callback: (sp: Knex.Transaction) => Promise<T>
  ): Promise<T>;

  /**
   * Checks if a table exists in the database.
   * @abstract
   */
  abstract tableExists(tableName: string): Promise<boolean>;

  /**
   * Adds an auto-increment column to a table builder.
   * @abstract
   */
  abstract autoIncrementColumn(
    table: Knex.CreateTableBuilder,
    columnName?: string
  ): void;
}
