// schema/indexes.ts - Index detection utilities

import type { Knex } from 'knex';

/**
 * Get all indexes for a table
 */
export async function getAllIndexes(knex: Knex, table: string): Promise<string[]> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    const result = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='index'
      AND tbl_name=?
      AND sql IS NOT NULL
      ORDER BY name
    `, [table]);
    return result.map((row: any) => row.name);
  } else if (client === 'mysql' || client === 'mysql2') {
    const result = await knex.raw(`
      SHOW INDEXES FROM ?? WHERE Key_name != 'PRIMARY'
    `, [table]);

    // Group by index name (indexes can span multiple columns)
    const indexNames = new Set<string>();
    for (const row of result[0]) {
      indexNames.add(row.Key_name);
    }
    return Array.from(indexNames).sort();
  } else if (client === 'pg') {
    const result = await knex.raw(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = ?
        AND indexname NOT LIKE '%_pkey'
      ORDER BY indexname
    `, [table]);
    return result.rows.map((row: any) => row.indexname);
  }

  // For other database clients
  return [];
}
