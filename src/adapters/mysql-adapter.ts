// src/adapters/mysql-adapter.ts
import knexLib from 'knex';
import type { Knex } from 'knex';
import type { DatabaseAdapter } from './types.js';

const { knex } = knexLib;

export class MySQLAdapter implements DatabaseAdapter {
  private knexInstance: Knex | null = null;

  // Feature detection
  readonly supportsReturning = false;
  readonly supportsJSON = true;
  readonly supportsUpsert = true;
  readonly supportsCTE = true;
  readonly supportsWindowFunctions = true;
  readonly supportsSavepoints = true;
  readonly databaseName = 'mysql' as const;

  async connect(config: Knex.Config): Promise<Knex> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async disconnect(): Promise<void> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  getKnex(): Knex {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async insertReturning<T extends Record<string, any>>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async upsert<T extends Record<string, any>>(
    table: string,
    data: Partial<T>,
    conflictColumns: string[],
    updateColumns?: string[]
  ): Promise<number> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  jsonExtract(column: string, path: string): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  jsonBuildObject(fields: Record<string, any>): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  currentTimestamp(): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  fromUnixEpoch(epochColumn: string): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  toUnixEpoch(timestampColumn: string): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  concat(...values: Array<string | Knex.Raw>): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  stringAgg(column: string, separator?: string): Knex.Raw {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>,
    options?: { isolationLevel?: 'serializable' | 'read committed' | 'repeatable read' }
  ): Promise<T> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async savepoint<T>(
    trx: Knex.Transaction,
    callback: (sp: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  async tableExists(tableName: string): Promise<boolean> {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }

  autoIncrementColumn(table: Knex.CreateTableBuilder, columnName?: string): void {
    throw new Error('MySQL adapter not implemented yet. Planned for Phase 3.');
  }
}
