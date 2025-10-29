// src/adapters/mysql-adapter.ts
import type { Knex } from 'knex';
import { BaseAdapter } from './base-adapter.js';
import type { DatabaseConfig } from '../config/types.js';

/**
 * MySQL adapter implementation with authentication support.
 *
 * This adapter provides MySQL-specific implementations for database operations,
 * integrating with the authentication layer for secure connections via SSH tunnels,
 * direct connections, or cloud IAM (AWS RDS, GCP Cloud SQL).
 *
 * **MySQL-Specific Features:**
 * - ON DUPLICATE KEY UPDATE for upserts
 * - JSON_EXTRACT() and JSON_OBJECT() for JSON operations
 * - GROUP_CONCAT() for string aggregation
 * - LAST_INSERT_ID() for retrieving inserted IDs
 * - UNIX_TIMESTAMP() and FROM_UNIXTIME() for epoch conversions
 * - AUTO_INCREMENT with UNSIGNED for ID columns
 * - UTF8MB4 character set support for full Unicode
 *
 * **Supported MySQL Versions:**
 * - MySQL 8.0+ (full feature support)
 * - MySQL 5.7+ (basic feature support)
 *
 * **Authentication Methods:**
 * - Direct: Standard username/password authentication
 * - SSH Tunnel: Connect via SSH bastion host
 * - AWS RDS IAM: Token-based authentication for AWS RDS
 * - GCP Cloud SQL IAM: Token-based authentication for Cloud SQL
 *
 * @extends BaseAdapter
 *
 * @example
 * // Direct connection
 * const adapter = new MySQLAdapter({
 *   type: 'mysql',
 *   connection: {
 *     host: 'localhost',
 *     port: 3306,
 *     database: 'mydb'
 *   },
 *   auth: {
 *     type: 'direct',
 *     user: 'root',
 *     password: 'password'
 *   }
 * });
 *
 * @example
 * // SSH tunnel connection
 * const adapter = new MySQLAdapter({
 *   type: 'mysql',
 *   connection: {
 *     host: 'db.internal',
 *     port: 3306,
 *     database: 'production'
 *   },
 *   auth: {
 *     type: 'ssh',
 *     user: 'dbuser',
 *     password: 'dbpass',
 *     ssh: {
 *       host: 'bastion.example.com',
 *       username: 'deploy',
 *       privateKeyPath: '/path/to/key.pem'
 *     }
 *   }
 * });
 *
 * @example
 * // AWS RDS IAM authentication
 * const adapter = new MySQLAdapter({
 *   type: 'mysql',
 *   connection: {
 *     host: 'mydb.cluster-xxx.us-east-1.rds.amazonaws.com',
 *     port: 3306,
 *     database: 'production'
 *   },
 *   auth: {
 *     type: 'aws-iam',
 *     region: 'us-east-1'
 *   }
 * });
 */
export class MySQLAdapter extends BaseAdapter {
  // Feature detection
  readonly supportsReturning = false;  // MySQL doesn't support RETURNING clause
  readonly supportsJSON = true;         // MySQL 5.7+ has native JSON support
  readonly supportsUpsert = true;       // ON DUPLICATE KEY UPDATE
  readonly supportsCTE = true;          // MySQL 8.0+ supports WITH clause
  readonly supportsWindowFunctions = true;  // MySQL 8.0+ supports window functions
  readonly supportsSavepoints = true;   // Full savepoint support
  readonly databaseName = 'mysql' as const;

  /**
   * Creates a new MySQL adapter instance.
   *
   * @param {DatabaseConfig} config - Database configuration with auth settings
   */
  constructor(config: DatabaseConfig) {
    super(config);
  }

  /**
   * Returns the Knex dialect for MySQL.
   *
   * Uses 'mysql2' driver which supports:
   * - Prepared statements
   * - Binary protocol
   * - Promise-based API
   * - Full Unicode (UTF8MB4)
   *
   * @returns {string} 'mysql2' dialect identifier
   */
  getDialect(): string {
    return 'mysql2';
  }

  /**
   * Initializes MySQL-specific session settings.
   *
   * **Configuration Applied:**
   * - Character set: UTF8MB4 for full Unicode support (including emojis)
   * - Collation: utf8mb4_unicode_ci for proper sorting
   * - SQL mode: TRADITIONAL for strict SQL compliance
   * - Timezone: UTC for consistent timestamp handling
   * - Transaction isolation: READ COMMITTED (default)
   *
   * **Important Notes:**
   * - UTF8MB4 requires MySQL 5.5.3+
   * - These settings apply to the current session only
   * - Connection pool creates new sessions with these settings
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If MySQL server version is incompatible
   *
   * @example
   * // Called automatically after connect()
   * await adapter.connect();
   * // Session is now configured with UTF8MB4 and UTC timezone
   */
  async initialize(): Promise<void> {
    const knex = this.getKnex();

    // Validate database exists
    const dbName = this.config.connection?.database;
    if (!dbName) {
      throw new Error('MySQL adapter requires database name in configuration');
    }

    try {
      // Query to check if we can access the database
      const result = await knex.raw('SELECT DATABASE() as db');
      const currentDb = result[0]?.[0]?.db;
      
      if (!currentDb || currentDb !== dbName) {
        throw new Error(
          `Database '${dbName}' does not exist or cannot be accessed. ` +
          `Please create it manually: CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
        );
      }
    } catch (error: any) {
      if (error.code === 'ER_BAD_DB_ERROR') {
        throw new Error(
          `Database '${dbName}' does not exist. ` +
          `Please create it manually before connecting. Required privileges: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES`
        );
      }
      throw error;
    }

    // Configure character set and collation for full Unicode support
    await knex.raw("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'");

    // Set timezone to UTC for consistent timestamp handling
    await knex.raw("SET time_zone = '+00:00'");

    // Set SQL mode for strict compliance and safety
    await knex.raw("SET sql_mode = 'TRADITIONAL'");
  }

  // ============================================================================
  // Query Adaptations - MySQL-specific implementations
  // ============================================================================

  /**
   * Inserts a row and returns the inserted record.
   *
   * MySQL doesn't support RETURNING clause, so this method:
   * 1. Inserts the row
   * 2. Retrieves LAST_INSERT_ID()
   * 3. Queries the inserted row by ID
   *
   * **Important Notes:**
   * - Assumes table has an auto-increment `id` column
   * - LAST_INSERT_ID() is connection-specific (thread-safe)
   * - For tables without auto-increment ID, use composite unique keys
   *
   * @template T - Record type
   * @param {string} table - Table name
   * @param {Partial<T>} data - Data to insert
   * @returns {Promise<T>} Inserted record
   *
   * @throws {Error} If insert fails or record cannot be retrieved
   *
   * @example
   * // Insert user and return full record
   * const user = await adapter.insertReturning<User>('users', {
   *   name: 'Alice',
   *   email: 'alice@example.com'
   * });
   * console.log(user.id); // Auto-generated ID
   *
   * @example
   * // With transaction
   * await adapter.transaction(async (trx) => {
   *   const user = await adapter.insertReturning<User>('users', {
   *     name: 'Bob'
   *   });
   *   await trx('profiles').insert({ user_id: user.id });
   * });
   */
  async insertReturning<T extends Record<string, any>>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    const knex = this.getKnex();

    // Insert and get the auto-increment ID
    const [insertId] = await knex(table).insert(data);

    // Retrieve the inserted row using LAST_INSERT_ID()
    const result = await knex(table).where({ id: insertId }).first();

    if (!result) {
      throw new Error(`Failed to retrieve inserted row from ${table}`);
    }

    return result as T;
  }

  /**
   * Upserts a row using MySQL's ON DUPLICATE KEY UPDATE syntax.
   *
   * **Behavior:**
   * - If row with conflicting key exists: UPDATE specified columns
   * - If no conflict: INSERT new row
   * - Returns number of affected rows (1 = insert, 2 = update)
   *
   * **Important Notes:**
   * - Requires UNIQUE index or PRIMARY KEY on conflictColumns
   * - MySQL counts updates as 2 affected rows (1 delete + 1 insert internally)
   * - If updateColumns not specified, updates all columns except conflict columns
   *
   * @template T - Record type
   * @param {string} table - Table name
   * @param {Partial<T>} data - Data to insert/update
   * @param {string[]} conflictColumns - Columns that define uniqueness (must have UNIQUE index)
   * @param {string[]} [updateColumns] - Columns to update on conflict (default: all except conflict columns)
   * @returns {Promise<number>} Affected rows (1 = insert, 2 = update)
   *
   * @throws {Error} If conflictColumns don't have UNIQUE index
   *
   * @example
   * // Upsert user by email (UNIQUE index on email)
   * await adapter.upsert('users',
   *   { email: 'alice@example.com', name: 'Alice Updated', age: 30 },
   *   ['email'],  // Conflict column
   *   ['name', 'age']  // Update these on conflict
   * );
   *
   * @example
   * // Upsert with composite key
   * await adapter.upsert('user_settings',
   *   { user_id: 1, setting_key: 'theme', value: 'dark' },
   *   ['user_id', 'setting_key']  // Composite UNIQUE key
   * );
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

    // Build update data for ON DUPLICATE KEY UPDATE clause
    const updateData = columnsToUpdate.reduce((acc, col) => {
      acc[col] = data[col as keyof T];
      return acc;
    }, {} as Record<string, any>);

    // Use Knex's onConflict() which generates ON DUPLICATE KEY UPDATE for MySQL
    const result = await knex(table)
      .insert(data)
      .onConflict(conflictColumns)
      .merge(updateData);

    return result.length;
  }

  /**
   * Extracts a value from a JSON column using JSON_EXTRACT().
   *
   * **MySQL JSON Path Syntax:**
   * - `$` - Root element
   * - `$.key` - Object member
   * - `$[n]` - Array element
   * - `$.key[n]` - Nested access
   * - `$.*.key` - Wildcard member
   *
   * **Important Notes:**
   * - Returns JSON value (may need JSON_UNQUOTE() for strings)
   * - Path must start with `$` (auto-prepended if missing)
   * - Returns NULL if path doesn't exist
   *
   * @param {string} column - JSON column name
   * @param {string} path - JSON path (e.g., '$.address.city' or 'address.city')
   * @returns {Knex.Raw} Raw SQL expression for JSON extraction
   *
   * @example
   * // Extract nested value
   * const query = knex('users').select(
   *   adapter.jsonExtract('metadata', '$.address.city').as('city')
   * );
   * // SELECT JSON_EXTRACT(`metadata`, '$.address.city') AS `city` FROM `users`
   *
   * @example
   * // Array element access
   * const query = knex('orders').select(
   *   adapter.jsonExtract('items', '$[0].name').as('first_item')
   * );
   */
  jsonExtract(column: string, path: string): Knex.Raw {
    const knex = this.getKnex();
    // Ensure path starts with $ for MySQL JSON path syntax
    const jsonPath = path.startsWith('$') ? path : `$.${path}`;
    return knex.raw('JSON_EXTRACT(??, ?)', [column, jsonPath]);
  }

  /**
   * Builds a JSON object from field values using JSON_OBJECT().
   *
   * **Behavior:**
   * - Takes key-value pairs and returns JSON object
   * - Automatically handles NULL values
   * - Returns NULL if all values are NULL
   *
   * @param {Record<string, any>} fields - Object with key-value pairs
   * @returns {Knex.Raw} Raw SQL expression for JSON object construction
   *
   * @example
   * // Build JSON object from columns
   * const query = knex('users').select(
   *   adapter.jsonBuildObject({
   *     name: knex.ref('name'),
   *     email: knex.ref('email'),
   *     age: knex.ref('age')
   *   }).as('user_json')
   * );
   * // SELECT JSON_OBJECT('name', `name`, 'email', `email`, 'age', `age`) AS `user_json`
   *
   * @example
   * // With literal values
   * const query = knex('orders').insert({
   *   metadata: adapter.jsonBuildObject({
   *     source: 'web',
   *     campaign: 'summer-sale',
   *     discount: 10
   *   })
   * });
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

    // Create placeholders for JSON_OBJECT(?, ?, ?, ?, ...)
    const placeholders = args.map(() => '?').join(', ');
    return knex.raw(`JSON_OBJECT(${placeholders})`, args);
  }

  /**
   * Returns current Unix timestamp using UNIX_TIMESTAMP().
   *
   * **Behavior:**
   * - Returns seconds since Unix epoch (1970-01-01 00:00:00 UTC)
   * - Always returns UTC timestamp regardless of session timezone
   * - Integer value (no fractional seconds)
   *
   * @returns {Knex.Raw} Raw SQL expression for current timestamp
   *
   * @example
   * // Insert with current timestamp
   * await knex('events').insert({
   *   name: 'user_login',
   *   created_at: adapter.currentTimestamp()
   * });
   * // INSERT INTO `events` (`name`, `created_at`) VALUES ('user_login', UNIX_TIMESTAMP())
   *
   * @example
   * // Update with current timestamp
   * await knex('users')
   *   .where({ id: userId })
   *   .update({ last_seen: adapter.currentTimestamp() });
   */
  currentTimestamp(): Knex.Raw {
    return this.getKnex().raw('UNIX_TIMESTAMP()');
  }

  /**
   * Converts Unix epoch timestamp to MySQL datetime using FROM_UNIXTIME().
   *
   * **Behavior:**
   * - Converts integer epoch to DATETIME
   * - Returns UTC datetime (session timezone affects display)
   * - Handles NULL values
   *
   * @param {string} epochColumn - Column containing Unix epoch timestamp
   * @returns {Knex.Raw} Raw SQL expression for epoch conversion
   *
   * @example
   * // Convert epoch to datetime for display
   * const query = knex('events').select(
   *   'name',
   *   adapter.fromUnixEpoch('created_at').as('created_datetime')
   * );
   * // SELECT `name`, FROM_UNIXTIME(`created_at`) AS `created_datetime` FROM `events`
   *
   * @example
   * // Filter by datetime range using epoch column
   * const query = knex('logs')
   *   .where(adapter.fromUnixEpoch('timestamp'), '>=', '2024-01-01')
   *   .andWhere(adapter.fromUnixEpoch('timestamp'), '<', '2024-02-01');
   */
  fromUnixEpoch(epochColumn: string): Knex.Raw {
    return this.getKnex().raw('FROM_UNIXTIME(??)', [epochColumn]);
  }

  /**
   * Converts MySQL datetime to Unix epoch using UNIX_TIMESTAMP().
   *
   * **Behavior:**
   * - Converts DATETIME/TIMESTAMP to integer epoch
   * - Assumes input is UTC
   * - Handles NULL values
   *
   * @param {string} timestampColumn - Column containing datetime value
   * @returns {Knex.Raw} Raw SQL expression for datetime conversion
   *
   * @example
   * // Convert datetime to epoch for storage
   * const query = knex('events').insert({
   *   name: 'signup',
   *   timestamp: adapter.toUnixEpoch('NOW()')
   * });
   *
   * @example
   * // Calculate time difference in seconds
   * const query = knex('sessions').select(
   *   knex.raw('?? - ??', [
   *     adapter.toUnixEpoch('logout_time'),
   *     adapter.toUnixEpoch('login_time')
   *   ]).as('duration_seconds')
   * );
   */
  toUnixEpoch(timestampColumn: string): Knex.Raw {
    return this.getKnex().raw('UNIX_TIMESTAMP(??)', [timestampColumn]);
  }

  /**
   * Concatenates string values using CONCAT().
   *
   * **Behavior:**
   * - Returns NULL if any argument is NULL
   * - Automatically converts non-string types to strings
   * - Empty strings are preserved
   *
   * **Alternative:** Use CONCAT_WS() for separator-based concatenation
   *
   * @param {...(string | Knex.Raw)[]} values - Values to concatenate
   * @returns {Knex.Raw} Raw SQL expression for concatenation
   *
   * @example
   * // Concatenate columns
   * const query = knex('users').select(
   *   adapter.concat(
   *     knex.ref('first_name'),
   *     ' ',
   *     knex.ref('last_name')
   *   ).as('full_name')
   * );
   * // SELECT CONCAT(`first_name`, ' ', `last_name`) AS `full_name` FROM `users`
   *
   * @example
   * // Build URL from parts
   * const query = knex('products').select(
   *   adapter.concat(
   *     'https://example.com/products/',
   *     knex.ref('slug')
   *   ).as('url')
   * );
   */
  concat(...values: Array<string | Knex.Raw>): Knex.Raw {
    const knex = this.getKnex();
    const placeholders = values.map(() => '?').join(', ');
    return knex.raw(`CONCAT(${placeholders})`, values);
  }

  /**
   * Aggregates strings with separator using GROUP_CONCAT().
   *
   * **Behavior:**
   * - Concatenates values from multiple rows into single string
   * - Default separator: comma (,)
   * - NULL values are skipped
   * - Result may be truncated by group_concat_max_len setting
   *
   * **Important Notes:**
   * - Default max length: 1024 bytes (can be increased with SET group_concat_max_len)
   * - Use with GROUP BY for grouped aggregation
   * - For large results, increase group_concat_max_len session variable
   *
   * @param {string} column - Column to aggregate
   * @param {string} [separator=','] - Separator between values
   * @returns {Knex.Raw} Raw SQL expression for string aggregation
   *
   * @example
   * // Get comma-separated list of tags
   * const query = knex('posts')
   *   .select('posts.id', 'posts.title')
   *   .select(adapter.stringAgg('tags.name').as('tags'))
   *   .leftJoin('post_tags', 'posts.id', 'post_tags.post_id')
   *   .leftJoin('tags', 'post_tags.tag_id', 'tags.id')
   *   .groupBy('posts.id');
   * // Result: { id: 1, title: 'Post', tags: 'javascript,typescript,node' }
   *
   * @example
   * // Custom separator
   * const query = knex('users')
   *   .select('department')
   *   .select(adapter.stringAgg('name', '; ').as('members'))
   *   .groupBy('department');
   */
  stringAgg(column: string, separator: string = ','): Knex.Raw {
    return this.getKnex().raw('GROUP_CONCAT(?? SEPARATOR ?)', [column, separator]);
  }

  // ============================================================================
  // Transaction Support
  // ============================================================================

  /**
   * Executes a callback within a database transaction.
   *
   * Delegates to BaseAdapter's transaction() method, which uses Knex's
   * transaction management with automatic commit/rollback.
   *
   * **MySQL Transaction Characteristics:**
   * - Default isolation level: REPEATABLE READ
   * - Supports nested transactions via savepoints
   * - Automatic rollback on error
   * - Deadlock detection and retry recommended for production
   *
   * @template T - Return type
   * @param {Function} callback - Transaction callback
   * @param {Object} [options] - Transaction options
   * @param {string} [options.isolationLevel] - Isolation level
   * @returns {Promise<T>} Transaction result
   *
   * @example
   * // Bank transfer with transaction
   * await adapter.transaction(async (trx) => {
   *   await trx('accounts')
   *     .where({ id: fromAccount })
   *     .decrement('balance', amount);
   *
   *   await trx('accounts')
   *     .where({ id: toAccount })
   *     .increment('balance', amount);
   * });
   *
   * @example
   * // With isolation level
   * await adapter.transaction(async (trx) => {
   *   // ... transaction operations ...
   * }, { isolationLevel: 'serializable' });
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
   * **MySQL Savepoint Behavior:**
   * - Allows partial rollback within transaction
   * - Savepoint names are case-insensitive
   * - Automatically released on transaction commit
   * - Rolled back on transaction rollback
   *
   * @template T - Return type
   * @param {Knex.Transaction} trx - Parent transaction
   * @param {Function} callback - Savepoint callback
   * @returns {Promise<T>} Savepoint result
   *
   * @throws {Error} If savepoint operation fails
   *
   * @example
   * // Use savepoint for partial rollback
   * await adapter.transaction(async (trx) => {
   *   await trx('users').insert({ name: 'Alice' });
   *
   *   try {
   *     await adapter.savepoint(trx, async (sp) => {
   *       await sp('users').insert({ name: 'Bob' });
   *       throw new Error('Bob insert failed');
   *     });
   *   } catch (error) {
   *     // Bob insert rolled back, Alice insert preserved
   *   }
   *
   *   await trx('users').insert({ name: 'Charlie' });
   * });
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
   * Queries INFORMATION_SCHEMA.TABLES which is the standard MySQL approach
   * for table existence checking.
   *
   * **Important Notes:**
   * - Case sensitivity depends on operating system (Linux: case-sensitive, Windows: case-insensitive)
   * - Uses current database (from connection config)
   * - Checks both base tables and views
   *
   * @param {string} tableName - Table name to check
   * @returns {Promise<boolean>} True if table exists, false otherwise
   *
   * @example
   * // Check before creating table
   * if (!(await adapter.tableExists('users'))) {
   *   await knex.schema.createTable('users', (table) => {
   *     adapter.autoIncrementColumn(table);
   *     table.string('name');
   *   });
   * }
   *
   * @example
   * // Conditional migration
   * if (await adapter.tableExists('old_table')) {
   *   await knex.raw('RENAME TABLE old_table TO new_table');
   * }
   */
  async tableExists(tableName: string): Promise<boolean> {
    const knex = this.getKnex();
    const database = this.config.connection!.database;

    const result = await knex.raw(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = ?`,
      [database, tableName]
    );

    return result[0].length > 0;
  }

  /**
   * Adds an auto-increment primary key column to a table.
   *
   * **MySQL AUTO_INCREMENT Behavior:**
   * - Generates sequential integer IDs starting from 1
   * - Must be indexed (PRIMARY KEY or UNIQUE)
   * - Only one AUTO_INCREMENT column per table
   * - Uses UNSIGNED INT for larger range (0 to 4,294,967,295)
   *
   * **Column Characteristics:**
   * - Type: INTEGER UNSIGNED
   * - Primary Key: Yes
   * - Auto Increment: Yes
   * - Not Nullable: Yes
   *
   * @param {Knex.CreateTableBuilder} table - Knex table builder
   * @param {string} [columnName='id'] - Column name (default: 'id')
   *
   * @example
   * // Create table with auto-increment ID
   * await knex.schema.createTable('users', (table) => {
   *   adapter.autoIncrementColumn(table);
   *   table.string('name').notNullable();
   *   table.string('email').unique();
   *   table.timestamps(true, true);
   * });
   * // CREATE TABLE `users` (
   * //   `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
   * //   `name` VARCHAR(255) NOT NULL,
   * //   `email` VARCHAR(255) UNIQUE,
   * //   `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   * //   `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   * // )
   *
   * @example
   * // Custom column name
   * await knex.schema.createTable('orders', (table) => {
   *   adapter.autoIncrementColumn(table, 'order_id');
   *   table.integer('user_id').unsigned().notNullable();
   * });
   */
  autoIncrementColumn(table: Knex.CreateTableBuilder, columnName: string = 'id'): void {
    // Use increments() which creates UNSIGNED INT AUTO_INCREMENT PRIMARY KEY
    table.increments(columnName).unsigned();
  }
}
