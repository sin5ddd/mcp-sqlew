// schema/views.ts - View detection and CREATE VIEW statement generation

import type { Knex } from 'knex';
import type { DatabaseFormat } from '../types.js';
import {
  convertIdentifierQuotes,
  convertTimestampFunctions,
} from '../../sql-dump-converters.js';

/**
 * Get all view names from the database
 */
export async function getAllViews(knex: Knex): Promise<string[]> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    const result = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='view'
      ORDER BY name
    `);
    return result.map((row: any) => row.name);
  } else if (client === 'mysql' || client === 'mysql2') {
    const result = await knex.raw(`
      SELECT TABLE_NAME as name
      FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);
    return result[0].map((row: any) => row.name);
  } else if (client === 'pg') {
    const result = await knex.raw(`
      SELECT viewname as name
      FROM pg_views
      WHERE schemaname = 'public'
      ORDER BY viewname
    `);
    return result.rows.map((row: any) => row.name);
  }

  throw new Error(`Unsupported database client: ${client}`);
}

/**
 * Get CREATE VIEW statement for a view
 */
export async function getCreateViewStatement(knex: Knex, viewName: string, targetFormat: DatabaseFormat): Promise<string> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    // SQLite: Get from sqlite_master
    const result = await knex.raw(`
      SELECT sql FROM sqlite_master
      WHERE type='view' AND name=?
    `, [viewName]);

    if (result.length === 0 || !result[0].sql) {
      throw new Error(`View ${viewName} not found`);
    }

    let createSql = result[0].sql;

    // Convert SQLite syntax to target format if needed
    if (targetFormat === 'mysql') {
      // Convert to MySQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'mysql');
      createSql = convertTimestampFunctions(createSql, 'mysql');
      // Fix type mismatch in COALESCE with numeric values: dn.value → CAST(dn.value AS CHAR)
      // MySQL doesn't allow mixing TEXT and DOUBLE PRECISION in COALESCE
      createSql = createSql.replace(/COALESCE\s*\(\s*NULLIF\s*\(\s*d\.value\s*,\s*''\s*\)\s*,\s*dn\.value\s*\)/gi,
                                   "COALESCE(NULLIF(d.value, ''), CAST(dn.value AS CHAR))");
    } else if (targetFormat === 'postgresql') {
      // Convert to PostgreSQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
      createSql = convertTimestampFunctions(createSql, 'postgresql');
      // Convert GROUP_CONCAT(col, sep) → string_agg(col, sep)
      createSql = createSql.replace(/GROUP_CONCAT\s*\(/gi, 'string_agg(');
      // Cast integer comparisons to be type-safe: column = 1 → column::integer = 1
      // This works for both boolean columns (TRUE::integer = 1) and integer enum columns
      createSql = createSql.replace(/(\w+)\s*=\s*([01])\b/g, '$1::integer = $2');
      // Fix type mismatch in COALESCE with numeric values: dn.value → CAST(dn.value AS TEXT)
      // PostgreSQL strictly enforces type compatibility in COALESCE
      createSql = createSql.replace(/COALESCE\s*\(\s*NULLIF\s*\(\s*d\.value\s*,\s*''\s*\)\s*,\s*dn\.value\s*\)/gi,
                                   "COALESCE(NULLIF(d.value, ''), CAST(dn.value AS TEXT))");
    }

    return createSql + ';';

  } else if (client === 'mysql' || client === 'mysql2') {
    // MySQL: Use SHOW CREATE VIEW
    const result = await knex.raw(`SHOW CREATE VIEW ??`, [viewName]);
    let createSql = result[0][0]['Create View'];

    if (targetFormat === 'sqlite') {
      // Convert MySQL to SQLite using shared converters
      createSql = convertIdentifierQuotes(createSql, 'sqlite');
      createSql = convertTimestampFunctions(createSql, 'sqlite');
      return createSql + ';';
    } else if (targetFormat === 'postgresql') {
      // Convert MySQL to PostgreSQL using shared converters
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
      createSql = convertTimestampFunctions(createSql, 'postgresql');
      return createSql + ';';
    }

    return createSql + ';';

  } else if (client === 'pg') {
    // PostgreSQL: Get from pg_views
    const result = await knex.raw(`
      SELECT definition
      FROM pg_views
      WHERE schemaname = 'public' AND viewname = ?
    `, [viewName]);

    if (result.rows.length === 0) {
      throw new Error(`View ${viewName} not found`);
    }

    let createSql = `CREATE VIEW "${viewName}" AS ${result.rows[0].definition}`;

    if (targetFormat === 'mysql') {
      createSql = convertIdentifierQuotes(createSql, 'mysql');
      return createSql + ';';
    } else if (targetFormat === 'sqlite') {
      createSql = convertTimestampFunctions(createSql, 'sqlite');
      return createSql + ';';
    }

    return createSql + ';';
  }

  throw new Error(`Unsupported database client: ${client}`);
}
