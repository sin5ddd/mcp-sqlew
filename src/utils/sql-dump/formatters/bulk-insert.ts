// formatters/bulk-insert.ts - Bulk INSERT statement generation

import knex from 'knex';
import type { DatabaseFormat, ConflictMode } from '../types.js';
import { quoteIdentifier } from './identifiers.js';
import { formatValue, convertValueWithType } from './value-formatter.js';

/**
 * Extract column names from INSERT SQL statement
 * E.g., 'insert into "m_agents" ("id", "name", "is_reusable") values ...' => ["id", "name", "is_reusable"]
 */
function extractColumnNamesFromInsertSql(sql: string): string[] {
  // Match: insert into "table" ("col1", "col2", "col3") values
  // Or: insert into `table` (`col1`, `col2`) values
  // Or: INSERT INTO table (col1, col2) VALUES
  const match = sql.match(/insert\s+(?:ignore\s+)?into\s+[`"]?\w+[`"]?\s*\((.*?)\)\s*values/i);
  if (!match) {
    return [];
  }

  const columnsPart = match[1];
  // Split by comma and extract column names (removing quotes and whitespace)
  return columnsPart
    .split(',')
    .map(col => col.trim().replace(/[`"]/g, ''));
}

/**
 * Embed bindings from Knex parameterized query into plain SQL
 * with optional type-aware conversion for cross-database migrations
 */
function embedBindings(
  sql: string,
  bindings: readonly any[],
  format: DatabaseFormat,
  columnTypes?: Map<string, string>,
  columnNames?: string[],
  columnInfo?: Map<string, any>  // NEW: columnInfo from knex(table).columnInfo()
): string {
  // Detect source format (for now, assume SQLite as source)
  // TODO: Make this configurable or detect from the knex instance
  const sourceFormat: DatabaseFormat = 'sqlite';

  if (format === 'postgresql') {
    // PostgreSQL: $1, $2, ... (replace in reverse order to avoid $10 matching $1)
    let result = sql;
    for (let i = bindings.length; i >= 1; i--) {
      const placeholder = `$${i}`;
      // For multi-row inserts, column names repeat: $1-$5 map to cols 0-4, $6-$10 map to cols 0-4, etc.
      const columnIndex = columnNames && columnNames.length > 0 ? (i - 1) % columnNames.length : i - 1;
      const columnName = columnNames?.[columnIndex] || '';

      // Use new convertValueWithType with columnInfo if available
      const value = columnInfo
        ? convertValueWithType(bindings[i - 1], columnName, columnInfo, sourceFormat, format)
        : formatValue(bindings[i - 1], format);

      result = result.replace(new RegExp(`\\${placeholder}\\b`, 'g'), value);
    }
    return result;
  } else {
    // MySQL/SQLite: ? placeholders
    let result = sql;
    let bindingIndex = 0;

    result = result.replace(/\?/g, () => {
      if (bindingIndex >= bindings.length) {
        throw new Error(`Not enough bindings: ${bindings.length} provided, more needed`);
      }
      // For multi-row inserts, column names repeat
      const columnIndex = columnNames && columnNames.length > 0 ? bindingIndex % columnNames.length : bindingIndex;
      const columnName = columnNames?.[columnIndex] || '';

      // Use new convertValueWithType with columnInfo if available
      const value = columnInfo
        ? convertValueWithType(bindings[bindingIndex], columnName, columnInfo, sourceFormat, format)
        : formatValue(bindings[bindingIndex], format);

      bindingIndex++;
      return value;
    });

    return result;
  }
}

/**
 * Create a throwaway Knex instance for SQL generation
 */
function createKnexForFormat(format: DatabaseFormat) {
  const client = format === 'mysql' ? 'mysql2' : format === 'postgresql' ? 'pg' : 'better-sqlite3';

  return knex({
    client,
    connection: client === 'better-sqlite3' ? { filename: ':memory:' } : {},
    useNullAsDefault: client === 'better-sqlite3',
  });
}

/**
 * Generate a bulk INSERT statement for a table with conflict resolution
 *
 * REFACTORED: Uses Knex query builder instead of manual string construction
 */
export function generateBulkInsert(
  table: string,
  rows: any[],
  format: DatabaseFormat,
  options: {
    chunkSize?: number;
    conflictMode?: ConflictMode;
    primaryKeys?: string[];
    columnTypes?: Map<string, string>;  // Optional: Column type metadata for cross-database type conversion
    columnInfo?: Map<string, any>;      // NEW: Full columnInfo from knex(table).columnInfo()
  } = {}
): string[] {
  if (rows.length === 0) {
    return [];
  }

  const {
    chunkSize = 100,
    conflictMode = 'error',
    primaryKeys = [],
    columnTypes,
    columnInfo,
  } = options;

  const statements: string[] = [];
  const targetKnex = createKnexForFormat(format);

  try {
    // Split into chunks to avoid too-large statements
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      // Use Knex to generate parameterized INSERT
      let builder = targetKnex(table).insert(chunk);

      // Handle conflict modes with Knex-specific methods
      if (conflictMode === 'ignore') {
        if (format === 'mysql') {
          // MySQL: INSERT IGNORE is handled via raw SQL modification
          const { sql, bindings } = builder.toSQL().toNative();
          const ignoreSql = sql.replace(/^insert into/i, 'INSERT IGNORE INTO');
          const columnNames = extractColumnNamesFromInsertSql(ignoreSql);
          const embedded = embedBindings(ignoreSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
          continue;
        } else if (format === 'postgresql') {
          // PostgreSQL: ON CONFLICT DO NOTHING
          // Note: Knex's onConflict() requires specifying columns, so we use raw SQL
          const { sql, bindings } = builder.toSQL().toNative();
          const conflictSql = sql + ' ON CONFLICT DO NOTHING';
          const columnNames = extractColumnNamesFromInsertSql(conflictSql);
          const embedded = embedBindings(conflictSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
          continue;
        } else {
          // SQLite: INSERT OR IGNORE
          const { sql, bindings} = builder.toSQL().toNative();
          const ignoreSql = sql.replace(/^insert into/i, 'INSERT OR IGNORE INTO');
          const columnNames = extractColumnNamesFromInsertSql(ignoreSql);
          const embedded = embedBindings(ignoreSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
          continue;
        }
      } else if (conflictMode === 'replace') {
        // REPLACE mode requires primary keys
        if (primaryKeys.length === 0) {
          throw new Error(`Cannot use 'replace' mode for table ${table}: no primary key found`);
        }

        const { sql, bindings } = builder.toSQL().toNative();
        const columns = Object.keys(chunk[0]);
        const nonPkColumns = columns.filter(col => !primaryKeys.includes(col));

        const columnNames = extractColumnNamesFromInsertSql(sql);

        if (format === 'mysql') {
          // MySQL: ON DUPLICATE KEY UPDATE
          const updateClauses = nonPkColumns.map(col => `${quoteIdentifier(col, format)} = VALUES(${quoteIdentifier(col, format)})`);
          const finalSql = `${sql}\nON DUPLICATE KEY UPDATE\n  ${updateClauses.join(',\n  ')}`;
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
        } else if (format === 'postgresql') {
          // PostgreSQL: ON CONFLICT DO UPDATE
          const quotedPks = primaryKeys.map(pk => quoteIdentifier(pk, format));
          const updateClauses = nonPkColumns.map(col => `${quoteIdentifier(col, format)} = EXCLUDED.${quoteIdentifier(col, format)}`);
          const finalSql = `${sql}\nON CONFLICT (${quotedPks.join(', ')}) DO UPDATE SET\n  ${updateClauses.join(',\n  ')}`;
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
        } else {
          // SQLite: ON CONFLICT DO UPDATE
          const quotedPks = primaryKeys.map(pk => quoteIdentifier(pk, format));
          const updateClauses = nonPkColumns.map(col => `${quoteIdentifier(col, format)} = excluded.${quoteIdentifier(col, format)}`);
          const finalSql = `${sql}\nON CONFLICT (${quotedPks.join(', ')}) DO UPDATE SET\n  ${updateClauses.join(',\n  ')}`;
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames, columnInfo);
          statements.push(embedded + ';');
        }
      } else {
        // ERROR mode: Standard INSERT
        const { sql, bindings } = builder.toSQL().toNative();
        const columnNames = extractColumnNamesFromInsertSql(sql);
        const embedded = embedBindings(sql, bindings, format, columnTypes, columnNames, columnInfo);
        statements.push(embedded + ';');
      }
    }

    return statements;
  } finally {
    // Clean up Knex instance
    targetKnex.destroy();
  }
}
