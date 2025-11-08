// schema/primary-keys.ts - Primary key detection utilities

import type { Knex } from 'knex';

/**
 * Get primary key columns for a table
 */
export async function getPrimaryKeyColumns(knex: Knex, table: string): Promise<string[]> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    // SQLite: Use PRAGMA table_info
    const result = await knex.raw(`PRAGMA table_info(${table})`);
    return result
      .filter((col: any) => col.pk > 0)
      .sort((a: any, b: any) => a.pk - b.pk)
      .map((col: any) => col.name);
  } else if (client === 'mysql' || client === 'mysql2') {
    // MySQL: Query information_schema
    const result = await knex.raw(`
      SELECT COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION
    `, [table]);
    return result[0].map((row: any) => row.COLUMN_NAME);
  } else if (client === 'pg') {
    // PostgreSQL: Query information_schema
    const result = await knex.raw(`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ?::regclass
        AND i.indisprimary
      ORDER BY a.attnum
    `, [table]);
    return result.rows.map((row: any) => row.column_name);
  }

  throw new Error(`Unsupported database client: ${client}`);
}
