// schema/indexes.ts - Index detection utilities

import type { Knex } from 'knex';

/**
 * Index metadata for filtering duplicate UNIQUE constraints
 */
export interface IndexMetadata {
  name: string;
  table: string;
  columns: string[];
  isUnique: boolean;
}

/**
 * Get index metadata for a specific index
 * Used to detect single-column UNIQUE indexes that are already in CREATE TABLE
 */
export async function getIndexMetadata(knex: Knex, indexName: string, table: string): Promise<IndexMetadata | null> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    // Get index info from SQLite
    // Note: PRAGMA doesn't support parameter binding, use template literal with escaped table name
    const escapedTable = table.replace(/'/g, "''");
    const escapedIndexName = indexName.replace(/'/g, "''");
    const indexList = await knex.raw(`PRAGMA index_list('${escapedTable}')`);
    const indexEntry = indexList.find((idx: any) => idx.name === indexName);

    if (!indexEntry) {
      return null;
    }

    const indexInfo = await knex.raw(`PRAGMA index_info('${escapedIndexName}')`);
    if (!indexInfo || indexInfo.length === 0) {
      return null;
    }
    const columns = indexInfo.map((col: any) => col.name);

    return {
      name: indexName,
      table,
      columns,
      isUnique: indexEntry.unique === 1,
    };
  } else if (client === 'mysql' || client === 'mysql2') {
    const result = await knex.raw(`SHOW INDEXES FROM ?? WHERE Key_name = ?`, [table, indexName]);
    if (result[0].length === 0) {
      return null;
    }

    const columns = result[0].map((row: any) => row.Column_name);
    const isUnique = result[0][0].Non_unique === 0;

    return {
      name: indexName,
      table,
      columns,
      isUnique,
    };
  } else if (client === 'pg') {
    // Get index definition and uniqueness from PostgreSQL
    const result = await knex.raw(`
      SELECT
        i.indisunique AS is_unique,
        ARRAY_AGG(a.attname ORDER BY array_position(i.indkey, a.attnum)) AS columns
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE c.relname = ?
      GROUP BY i.indisunique
    `, [indexName]);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      name: indexName,
      table,
      columns: result.rows[0].columns,
      isUnique: result.rows[0].is_unique,
    };
  }

  return null;
}

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
