// src/adapters/postgresql-adapter.ts
import type { Knex } from 'knex';
import { BaseAdapter } from './base-adapter.js';
import type { DatabaseConfig } from '../config/types.js';

/**
 * PostgreSQL adapter implementation with authentication support.
 *
 * This adapter provides PostgreSQL-specific implementations for database operations,
 * integrating with the authentication layer for secure connections via SSH tunnels,
 * direct connections, or cloud IAM (AWS RDS, GCP Cloud SQL).
 *
 * **PostgreSQL-Specific Features:**
 * - RETURNING clause for insert/update/delete
 * - ON CONFLICT ... DO UPDATE for upserts
 * - jsonb_extract_path() and jsonb_build_object() for JSON operations
 * - string_agg() for string aggregation
 * - EXTRACT(EPOCH FROM ...) for Unix timestamp conversions
 * - SERIAL/BIGSERIAL for auto-increment columns
 * - Full transaction support with savepoints
 * - Common Table Expressions (CTEs) and window functions
 *
 * **Supported PostgreSQL Versions:**
 * - PostgreSQL 16+ (full feature support)
 * - PostgreSQL 12-15 (full feature support)
 * - PostgreSQL 9.5+ (basic feature support)
 *
 * **Authentication Methods:**
 * - Direct: Standard username/password authentication
 * - SSH Tunnel: Connect via SSH bastion host
 * - AWS RDS IAM: Token-based authentication for AWS RDS
 * - GCP Cloud SQL IAM: Token-based authentication for Cloud SQL
 *
 * @extends BaseAdapter
 */
export class PostgreSQLAdapter extends BaseAdapter {
  // Feature detection
  readonly supportsReturning = true;       // RETURNING clause support
  readonly supportsJSON = true;            // Native JSON/JSONB support
  readonly supportsUpsert = true;          // ON CONFLICT support (9.5+)
  readonly supportsCTE = true;             // WITH clause support
  readonly supportsWindowFunctions = true; // Window functions support
  readonly supportsSavepoints = true;      // Full savepoint support
  readonly databaseName = 'postgresql' as const;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  /**
   * Returns the Knex dialect for PostgreSQL.
   *
   * Uses 'pg' driver which supports:
   * - Prepared statements
   * - Promise-based API
   * - Connection pooling
   * - Full Unicode support
   *
   * @returns {string} 'pg' dialect identifier
   */
  getDialect(): string {
    return 'pg';
  }

  /**
   * Initializes PostgreSQL-specific session settings.
   *
   * **Configuration Applied:**
   * - Timezone: UTC for consistent timestamp handling
   * - Statement timeout: 30 seconds (prevents long-running queries)
   * - Client encoding: UTF8 for full Unicode support
   * - Default transaction isolation: READ COMMITTED
   *
   * @returns {Promise<void>}
   * @throws {Error} If database does not exist or cannot be accessed
   */
  async initialize(): Promise<void> {
    const knex = this.getKnex();

    // Validate database exists
    const dbName = this.config.connection?.database;
    if (!dbName) {
      throw new Error('PostgreSQL adapter requires database name in configuration');
    }

    try {
      // Check if we can access the database
      const result = await knex.raw('SELECT current_database() as db');
      const currentDb = result.rows?.[0]?.db;

      if (!currentDb || currentDb !== dbName) {
        throw new Error(
          `Database '${dbName}' does not exist or cannot be accessed. ` +
          `Please create it manually: CREATE DATABASE ${dbName} ENCODING 'UTF8';`
        );
      }
    } catch (error: any) {
      if (error.code === '3D000') {
        // INVALID CATALOG NAME
        throw new Error(
          `Database '${dbName}' does not exist. ` +
          `Please create it manually before connecting.`
        );
      }
      throw error;
    }

    // Set timezone to UTC for consistent timestamp handling
    await knex.raw("SET timezone = 'UTC'");

    // Set statement timeout to prevent long-running queries
    await knex.raw('SET statement_timeout = 30000'); // 30 seconds

    // Ensure UTF8 encoding
    await knex.raw("SET client_encoding = 'UTF8'");
  }

  // ============================================================================
  // Query Adaptations - PostgreSQL-specific implementations
  // ============================================================================

  /**
   * Inserts a row and returns the inserted record using RETURNING clause.
   *
   * PostgreSQL supports RETURNING clause natively, making this more efficient
   * than MySQL's approach (insert + select).
   *
   * @template T - Record type
   * @param {string} table - Table name
   * @param {Partial<T>} data - Data to insert
   * @returns {Promise<T>} Inserted record
   * @throws {Error} If insert fails
   */
  async insertReturning<T extends Record<string, any>>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    const knex = this.getKnex();

    // Use RETURNING * to get the complete inserted row
    const [result] = await knex(table).insert(data).returning('*');

    if (!result) {
      throw new Error(`Failed to insert row into ${table}`);
    }

    return result as T;
  }

  /**
   * Upserts a row using PostgreSQL's ON CONFLICT ... DO UPDATE syntax.
   *
   * **Behavior:**
   * - If row with conflicting key exists: UPDATE specified columns
   * - If no conflict: INSERT new row
   * - Returns number of affected rows
   *
   * @template T - Record type
   * @param {string} table - Table name
   * @param {Partial<T>} data - Data to insert/update
   * @param {string[]} conflictColumns - Columns that define uniqueness (must have UNIQUE index)
   * @param {string[]} [updateColumns] - Columns to update on conflict (default: all except conflict columns)
   * @returns {Promise<number>} Affected rows (1 = insert or update)
   * @throws {Error} If conflictColumns don't have UNIQUE constraint
   */
  async upsert<T extends Record<string, any>>(
    table: string,
    data: Partial<T>,
    conflictColumns: string[],
    updateColumns?: string[]
  ): Promise<number> {
    const knex = this.getKnex();

    // Determine which columns to update on conflict
    const columnsToUpdate = updateColumns || Object.keys(data).filter(
      key => !conflictColumns.includes(key)
    );

    // Build update data for DO UPDATE SET clause
    const updateData = columnsToUpdate.reduce((acc, col) => {
      acc[col] = data[col as keyof T];
      return acc;
    }, {} as Record<string, any>);

    // Use Knex's onConflict() which generates ON CONFLICT ... DO UPDATE for PostgreSQL
    const result = await knex(table)
      .insert(data)
      .onConflict(conflictColumns)
      .merge(updateData);

    return result.length;
  }

  /**
   * Extracts a value from a JSONB column using jsonb_extract_path_text().
   *
   * **PostgreSQL JSON Path Syntax:**
   * - Nested objects: 'address', 'city' (separate arguments)
   * - Array access: Use jsonb_array_element() separately
   *
   * @param {string} column - JSONB column name
   * @param {string} path - JSON path (e.g., 'address.city')
   * @returns {Knex.Raw} Raw SQL expression for JSON extraction
   */
  jsonExtract(column: string, path: string): Knex.Raw {
    const knex = this.getKnex();
    // Split path by '.' and use as separate arguments
    const pathParts = path.replace(/^\$\.?/, '').split('.');
    const placeholders = ['??', ...pathParts.map(() => '?')].join(', ');
    return knex.raw(`jsonb_extract_path_text(${placeholders})`, [column, ...pathParts]);
  }

  /**
   * Builds a JSON object from field values using jsonb_build_object().
   *
   * @param {Record<string, any>} fields - Object with key-value pairs
   * @returns {Knex.Raw} Raw SQL expression for JSON object construction
   */
  jsonBuildObject(fields: Record<string, any>): Knex.Raw {
    const knex = this.getKnex();
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    // Build arguments array: [key1, value1, key2, value2, ...]
    const args: any[] = [];
    keys.forEach((key, i) => {
      args.push(key);
      args.push(values[i]);
    });

    // Create placeholders for jsonb_build_object(?, ?, ?, ?, ...)
    const placeholders = args.map(() => '?').join(', ');
    return knex.raw(`jsonb_build_object(${placeholders})`, args);
  }

  /**
   * Returns current Unix timestamp using EXTRACT(EPOCH FROM NOW()).
   *
   * **Behavior:**
   * - Returns seconds since Unix epoch (1970-01-01 00:00:00 UTC)
   * - Always returns UTC timestamp
   * - Returns numeric value (may have fractional seconds)
   *
   * @returns {Knex.Raw} Raw SQL expression for current timestamp
   */
  currentTimestamp(): Knex.Raw {
    return this.getKnex().raw('EXTRACT(EPOCH FROM NOW())::INTEGER');
  }

  /**
   * Converts Unix epoch timestamp to PostgreSQL timestamp using TO_TIMESTAMP().
   *
   * **Behavior:**
   * - Converts integer epoch to TIMESTAMP WITH TIME ZONE
   * - Returns UTC timestamp
   * - Handles NULL values
   *
   * @param {string} epochColumn - Column containing Unix epoch timestamp
   * @returns {Knex.Raw} Raw SQL expression for epoch conversion
   */
  fromUnixEpoch(epochColumn: string): Knex.Raw {
    return this.getKnex().raw('TO_TIMESTAMP(??)', [epochColumn]);
  }

  /**
   * Converts PostgreSQL timestamp to Unix epoch using EXTRACT(EPOCH FROM ...).
   *
   * **Behavior:**
   * - Converts TIMESTAMP to integer epoch
   * - Assumes input is UTC
   * - Handles NULL values
   *
   * @param {string} timestampColumn - Column containing timestamp value
   * @returns {Knex.Raw} Raw SQL expression for timestamp conversion
   */
  toUnixEpoch(timestampColumn: string): Knex.Raw {
    return this.getKnex().raw('EXTRACT(EPOCH FROM ??)::INTEGER', [timestampColumn]);
  }

  /**
   * Concatenates string values using || operator.
   *
   * **Behavior:**
   * - PostgreSQL uses || for concatenation
   * - Returns NULL if any argument is NULL (use COALESCE to handle)
   * - Empty strings are preserved
   *
   * @param {...(string | Knex.Raw)[]} values - Values to concatenate
   * @returns {Knex.Raw} Raw SQL expression for concatenation
   */
  concat(...values: Array<string | Knex.Raw>): Knex.Raw {
    const knex = this.getKnex();
    const placeholders = values.map(() => '?').join(' || ');
    return knex.raw(`(${placeholders})`, values);
  }

  /**
   * Aggregates strings with separator using string_agg().
   *
   * **Behavior:**
   * - Concatenates values from multiple rows into single string
   * - NULL values are skipped
   * - No result length limit (unlike MySQL's GROUP_CONCAT)
   *
   * @param {string} column - Column to aggregate
   * @param {string} [separator=','] - Separator between values
   * @returns {Knex.Raw} Raw SQL expression for string aggregation
   */
  stringAgg(column: string, separator: string = ','): Knex.Raw {
    return this.getKnex().raw('string_agg(??, ?)', [column, separator]);
  }

  // ============================================================================
  // Transaction Support
  // ============================================================================

  /**
   * Executes a callback within a database transaction.
   *
   * **PostgreSQL Transaction Characteristics:**
   * - Default isolation level: READ COMMITTED
   * - Supports nested transactions via savepoints
   * - Automatic rollback on error
   * - MVCC (Multi-Version Concurrency Control)
   *
   * @template T - Return type
   * @param {Function} callback - Transaction callback
   * @param {Object} [options] - Transaction options
   * @param {string} [options.isolationLevel] - Isolation level
   * @returns {Promise<T>} Transaction result
   */
  async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>,
    options?: { isolationLevel?: 'serializable' | 'read committed' | 'repeatable read' }
  ): Promise<T> {
    // Delegate to BaseAdapter's implementation
    return super.transaction(callback, options);
  }

  /**
   * Creates a savepoint within a transaction.
   *
   * **PostgreSQL Savepoint Behavior:**
   * - Allows partial rollback within transaction
   * - Savepoint names are case-sensitive
   * - Automatically released on transaction commit
   * - Rolled back on transaction rollback
   *
   * @template T - Return type
   * @param {Knex.Transaction} trx - Parent transaction
   * @param {Function} callback - Savepoint callback
   * @returns {Promise<T>} Savepoint result
   */
  async savepoint<T>(
    trx: Knex.Transaction,
    callback: (sp: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    return trx.savepoint(callback);
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  /**
   * Checks if a table exists in the database.
   *
   * Queries information_schema.tables which is the standard PostgreSQL approach
   * for table existence checking.
   *
   * @param {string} tableName - Table name to check
   * @returns {Promise<boolean>} True if table exists, false otherwise
   */
  async tableExists(tableName: string): Promise<boolean> {
    const knex = this.getKnex();
    const database = this.config.connection!.database;

    const result = await knex.raw(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_catalog = ?
         AND table_name = ?`,
      [database, tableName]
    );

    return result.rows.length > 0;
  }

  /**
   * Adds a serial auto-increment primary key column to a table.
   *
   * **PostgreSQL SERIAL Behavior:**
   * - SERIAL = INTEGER with auto-increment (sequence)
   * - BIGSERIAL = BIGINT with auto-increment (recommended for large tables)
   * - Automatically creates a sequence (tablename_columnname_seq)
   * - Primary key constraint added automatically
   *
   * @param {Knex.CreateTableBuilder} table - Knex table builder
   * @param {string} [columnName='id'] - Column name (default: 'id')
   */
  autoIncrementColumn(table: Knex.CreateTableBuilder, columnName: string = 'id'): void {
    // Use increments() which creates SERIAL PRIMARY KEY for PostgreSQL
    table.increments(columnName);
  }
}
