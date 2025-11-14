// src/adapters/sqlite-adapter.ts
import knexLib from 'knex';
import type { Knex } from 'knex';
import { BaseAdapter } from './base-adapter.js';
import type { DatabaseConfig } from '../config/types.js';

const { knex } = knexLib;

/**
 * SQLite adapter implementation with BaseAdapter integration.
 *
 * SQLite is a file-based database that doesn't require authentication,
 * so this adapter overrides the connect() method to bypass the auth flow.
 *
 * @extends BaseAdapter
 */
export class SQLiteAdapter extends BaseAdapter {
  private rawConnection: any = null;

  // Feature detection
  readonly supportsReturning = false;
  readonly supportsJSON = false;
  readonly supportsUpsert = true;
  readonly supportsCTE = true;
  readonly supportsWindowFunctions = true;
  readonly supportsSavepoints = true;
  readonly databaseName = 'sqlite' as const;

  /**
   * Creates a new SQLite adapter instance.
   *
   * @param config - Database configuration (auth is ignored for SQLite)
   */
  constructor(config: DatabaseConfig) {
    super(config);
  }

  /**
   * Returns the Knex dialect for SQLite.
   */
  getDialect(): string {
    return 'better-sqlite3';
  }

  /**
   * Initializes SQLite-specific settings (PRAGMA configuration).
   */
  async initialize(): Promise<void> {
    const knex = this.getKnex();

    // Configure SQLite pragmas for optimal performance and safety
    await knex.raw('PRAGMA journal_mode = WAL');
    await knex.raw('PRAGMA foreign_keys = ON');
    await knex.raw('PRAGMA synchronous = NORMAL');
    await knex.raw('PRAGMA busy_timeout = 5000');
  }

  /**
   * Establishes SQLite connection (overrides BaseAdapter to bypass auth).
   *
   * SQLite doesn't require authentication, so we create the Knex instance
   * directly without going through the authentication provider flow.
   */
  async connect(config?: Knex.Config): Promise<Knex> {
    // Return existing connection if already established
    if (this.knexInstance) {
      return this.knexInstance;
    }

    // Build configuration
    const connectionConfig = config || {
      client: 'better-sqlite3',
      connection: {
        filename: this.config.connection!.database,
      },
      useNullAsDefault: true,
    };

    // Create Knex instance
    this.knexInstance = knex(connectionConfig);

    // Initialize SQLite settings
    await this.initialize();

    return this.knexInstance;
  }

  /**
   * Closes SQLite connection.
   */
  async disconnect(): Promise<void> {
    if (this.knexInstance) {
      try {
        // Checkpoint WAL to ensure all changes are written to main database
        await this.knexInstance.raw('PRAGMA wal_checkpoint(TRUNCATE)');
        // Optimize database before closing
        await this.knexInstance.raw('PRAGMA optimize');
      } catch (error) {
        // Ignore errors if WAL mode is not enabled or other pragma failures
      }

      // Close raw connection if it was acquired
      if (this.rawConnection) {
        if (typeof this.rawConnection.close === 'function') {
          this.rawConnection.close();
        }
        this.rawConnection = null;
      }

      // Force immediate destruction of all connections
      await this.knexInstance.destroy();
      this.knexInstance = null;
    }
  }

  /**
   * Get raw better-sqlite3 Database instance
   * For legacy code that uses db.prepare() directly
   *
   * Note: Acquires connection on first call and caches it.
   * This connection will be closed when disconnect() is called.
   */
  getRawDatabase(): any {
    if (!this.knexInstance) {
      throw new Error('Database not connected. Call connect() first.');
    }

    // Lazy-load the raw connection on first access
    if (!this.rawConnection) {
      // Get the underlying better-sqlite3 connection from Knex
      const client = (this.knexInstance.client as any);
      // For better-sqlite3, the connection is available directly
      this.rawConnection = client.driver;
    }

    return this.rawConnection;
  }

  // Query Adaptations
  async insertReturning<T extends Record<string, any>>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    const knex = this.getKnex();
    const [id] = await knex(table).insert(data);
    const result = await knex(table).where({ id }).first();
    if (!result) {
      throw new Error(`Failed to retrieve inserted row from ${table}`);
    }
    return result as T;
  }

  async upsert<T extends Record<string, any>>(
    table: string,
    data: Partial<T>,
    conflictColumns: string[],
    updateColumns?: string[]
  ): Promise<number> {
    const knex = this.getKnex();
    const columnsToUpdate = updateColumns || Object.keys(data).filter(
      key => !conflictColumns.includes(key)
    );

    const updateData = columnsToUpdate.reduce((acc, col) => {
      acc[col] = data[col as keyof T];
      return acc;
    }, {} as Record<string, any>);

    const result = await knex(table)
      .insert(data)
      .onConflict(conflictColumns)
      .merge(updateData);

    return result.length;
  }

  jsonExtract(column: string, path: string): Knex.Raw {
    const knex = this.getKnex();
    const jsonPath = path.startsWith('$') ? path : `$.${path}`;
    return knex.raw(`json_extract(??, ?)`, [column, jsonPath]);
  }

  jsonBuildObject(fields: Record<string, any>): Knex.Raw {
    const knex = this.getKnex();
    const keys = Object.keys(fields);
    const values = Object.values(fields);
    const args: any[] = [];
    keys.forEach((key, i) => {
      args.push(key);
      args.push(values[i]);
    });
    const placeholders = args.map(() => '?').join(', ');
    return knex.raw(`json_object(${placeholders})`, args);
  }

  currentTimestamp(): Knex.Raw {
    return this.getKnex().raw('unixepoch()');
  }

  fromUnixEpoch(epochColumn: string): Knex.Raw {
    return this.getKnex().raw(`datetime(??, 'unixepoch')`, [epochColumn]);
  }

  toUnixEpoch(timestampColumn: string): Knex.Raw {
    return this.getKnex().raw(`strftime('%s', ??)`, [timestampColumn]);
  }

  concat(...values: Array<string | Knex.Raw>): Knex.Raw {
    const knex = this.getKnex();
    const placeholders = values.map(() => '??').join(' || ');
    return knex.raw(placeholders, values);
  }

  stringAgg(column: string, separator: string = ','): Knex.Raw {
    return this.getKnex().raw(`GROUP_CONCAT(??, ?)`, [column, separator]);
  }

  // Transactions
  async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>,
    options?: { isolationLevel?: 'serializable' | 'read committed' | 'repeatable read' }
  ): Promise<T> {
    return this.getKnex().transaction(callback);
  }

  async savepoint<T>(
    trx: Knex.Transaction,
    callback: (sp: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    return trx.savepoint(callback);
  }

  // Schema Management
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.getKnex().raw(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return result.length > 0;
  }

  autoIncrementColumn(table: Knex.CreateTableBuilder, columnName: string = 'id'): void {
    table.increments(columnName);
  }
}
