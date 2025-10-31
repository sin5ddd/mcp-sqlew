// sql-dump.ts - Utility functions for generating SQL dump files

import type { Knex } from 'knex';
import knex from 'knex';

export type DatabaseFormat = 'mysql' | 'postgresql' | 'sqlite';
export type ConflictMode = 'error' | 'ignore' | 'replace';

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

/**
 * Get CREATE TABLE statement for a table
 */
export async function getCreateTableStatement(knex: Knex, table: string, targetFormat: DatabaseFormat): Promise<string> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    // SQLite: Get from sqlite_master
    const result = await knex.raw(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name=?
    `, [table]);

    if (result.length === 0 || !result[0].sql) {
      throw new Error(`Table ${table} not found`);
    }

    let createSql = result[0].sql;

    // Convert SQLite syntax to target format if needed
    if (targetFormat === 'mysql') {
      // Convert to MySQL syntax
      createSql = createSql
        // Normalize quotes: double quotes → backticks for identifiers
        .replace(/"(\w+)"/g, '`$1`')
        // Convert AUTOINCREMENT to AUTO_INCREMENT
        .replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT')
        // Convert TEXT columns with defaults to VARCHAR (MySQL doesn't allow defaults on TEXT)
        .replace(/\bTEXT(\s+(?:NOT\s+NULL\s+)?default\s+[^,\)]+)/gi, 'VARCHAR(255)$1')
        // Remove CHECK constraints with nested parentheses (not well-supported in MariaDB 10.5)
        // Match: check (...) including nested parens like check (`col` in ('a', 'b'))
        .replace(/\s+check\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, '')
        // Remove SQLite DEFAULT functions (strftime, etc.)
        .replace(/default\s*\(strftime\([^)]+\)\)/gi, 'default 0')
        .replace(/default\s+strftime\([^)]+\)/gi, 'default 0');

      // Handle PRIMARY KEY constraints with long VARCHAR columns
      // MySQL has a 768 byte limit for InnoDB PRIMARY KEYs (with utf8mb4, that's ~191 chars)
      const pkMatch = createSql.match(/primary key\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkColumns = pkMatch[1];
        const columnInfo = await knex(table).columnInfo();

        // Process each column in the primary key
        const processedPkCols = pkColumns.split(',').map((col: string) => {
          const colName = col.trim().replace(/[`"]/g, '');
          const info = columnInfo[colName];

          if (info && (info as any).type) {
            const type = (info as any).type.toLowerCase();
            if (type.includes('varchar') || type.includes('text')) {
              const maxLength = (info as any).maxLength;
              if (maxLength && parseInt(maxLength) > 191) {
                return `\`${colName}\`(191)`;
              } else if (type.includes('text')) {
                return `\`${colName}\`(191)`;
              }
            }
          }
          return `\`${colName}\``;
        }).join(', ');

        // Replace the primary key definition
        createSql = createSql.replace(/primary key\s*\([^)]+\)/i, `primary key (${processedPkCols})`);
      }

      // Note: knex_migrations.migration_time stays as datetime for MySQL
      // (Knex expects datetime format for compatibility with its migration system)
    } else if (targetFormat === 'postgresql') {
      // Convert to PostgreSQL syntax
      createSql = createSql
        // PostgreSQL uses double quotes for identifiers, not backticks (smart replacement)
        // This only replaces identifier quotes, not backticks inside string literals
        .replace(/`([a-zA-Z0-9_\.\-]+)`/g, '"$1"')
        // Use GENERATED BY DEFAULT to allow explicit ID values during data import
        .replace(/AUTOINCREMENT/gi, 'GENERATED BY DEFAULT AS IDENTITY')
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
        // Convert SQLite datetime type to PostgreSQL timestamp
        .replace(/\bdatetime\b/gi, 'TIMESTAMP')
        // Convert boolean defaults: '0' → false, '1' → true
        .replace(/boolean\s+default\s+'0'/gi, 'boolean default false')
        .replace(/boolean\s+default\s+'1'/gi, 'boolean default true')
        .replace(/boolean\s+default\s+0\b/gi, 'boolean default false')
        .replace(/boolean\s+default\s+1\b/gi, 'boolean default true')
        // Remove SQLite DEFAULT functions (strftime, etc.)
        .replace(/default\s*\(strftime\([^)]+\)\)/gi, 'default 0')
        .replace(/default\s+strftime\([^)]+\)/gi, 'default 0');
    }

    return createSql + ';';

  } else if (client === 'mysql' || client === 'mysql2') {
    // MySQL: Use SHOW CREATE TABLE
    const result = await knex.raw(`SHOW CREATE TABLE ??`, [table]);
    let createSql = result[0][0]['Create Table'];

    if (targetFormat === 'sqlite') {
      // Basic conversion to SQLite
      return createSql
        .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
        .replace(/ENGINE=\w+/gi, '')
        .replace(/DEFAULT CHARSET=\w+/gi, '')
        + ';';
    } else if (targetFormat === 'postgresql') {
      // Basic conversion to PostgreSQL
      return createSql
        .replace(/`/g, '"')
        .replace(/AUTO_INCREMENT/gi, 'GENERATED ALWAYS AS IDENTITY')
        .replace(/ENGINE=\w+/gi, '')
        + ';';
    } else if (targetFormat === 'mysql') {
      // MySQL → MySQL: Apply prefix length to TEXT/long VARCHAR in PRIMARY KEY
      const pkMatch = createSql.match(/primary key\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkColumns = pkMatch[1];
        const columnInfo = await knex(table).columnInfo();

        const processedPkCols = pkColumns.split(',').map((col: string) => {
          const colName = col.trim().replace(/[`"]/g, '');
          const info = columnInfo[colName];

          if (info && (info as any).type) {
            const type = (info as any).type.toLowerCase();
            if (type.includes('varchar') || type.includes('text')) {
              const maxLength = (info as any).maxLength;
              if (maxLength && parseInt(maxLength) > 191) {
                return `\`${colName}\`(191)`;
              } else if (type.includes('text')) {
                return `\`${colName}\`(191)`;
              }
            }
          }
          return `\`${colName}\``;
        }).join(', ');

        createSql = createSql.replace(/primary key\s*\([^)]+\)/i, `PRIMARY KEY (${processedPkCols})`);
      }
    }

    return createSql + ';';

  } else if (client === 'pg') {
    // PostgreSQL: Reconstruct from information_schema (simplified)
    // For production, consider using pg_dump
    const columns = await knex.raw(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = ?
      ORDER BY ordinal_position
    `, [table]);

    const columnDefs = columns.rows.map((col: any) => {
      let def = `"${col.column_name}" ${col.data_type.toUpperCase()}`;
      if (col.character_maximum_length) {
        def += `(${col.character_maximum_length})`;
      }
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }
      return def;
    });

    const createSql = `CREATE TABLE "${table}" (\n  ${columnDefs.join(',\n  ')}\n)`;

    if (targetFormat === 'mysql') {
      return createSql.replace(/"/g, '`') + ';';
    } else if (targetFormat === 'sqlite') {
      return createSql.replace(/SERIAL/gi, 'INTEGER').replace(/GENERATED ALWAYS AS IDENTITY/gi, 'AUTOINCREMENT') + ';';
    }

    return createSql + ';';
  }

  throw new Error(`Unsupported database client: ${client}`);
}

/**
 * Get all table names from the database (excluding system tables)
 */
export async function getAllTables(knex: Knex, includeKnexTables = false): Promise<string[]> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    const knexFilter = includeKnexTables ? '' : "AND name NOT LIKE 'knex_%'";
    const result = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      ${knexFilter}
      ORDER BY name
    `);
    return result.map((row: any) => row.name);
  } else if (client === 'mysql' || client === 'mysql2') {
    const result = await knex.raw('SHOW TABLES');
    const tableKey = Object.keys(result[0][0])[0];
    const tables = result[0].map((row: any) => row[tableKey]);
    return includeKnexTables ? tables : tables.filter((t: string) => !t.startsWith('knex_'));
  } else if (client === 'pg') {
    const knexFilter = includeKnexTables ? '' : "AND tablename NOT LIKE 'knex_%'";
    const result = await knex.raw(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ${knexFilter}
      ORDER BY tablename
    `);
    return result.rows.map((row: any) => row.tablename);
  }

  throw new Error(`Unsupported database client: ${client}`);
}

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
  }

  // For MySQL/PostgreSQL, indexes are part of table definition
  return [];
}

/**
 * Get CREATE INDEX statement for an index
 */
export async function getCreateIndexStatement(knex: Knex, indexName: string, targetFormat: DatabaseFormat): Promise<string> {
  const client = knex.client.config.client;

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    const result = await knex.raw(`
      SELECT sql, tbl_name FROM sqlite_master
      WHERE type='index' AND name=?
    `, [indexName]);

    if (result.length === 0 || !result[0].sql) {
      throw new Error(`Index ${indexName} not found`);
    }

    let createSql = result[0].sql;
    const tableName = result[0].tbl_name;

    // Convert to target format if needed
    if (targetFormat === 'mysql') {
      createSql = createSql.replace(/"/g, '`');

      // MySQL has a 3072 byte limit for index keys (with utf8mb4, that's ~768 chars)
      // Add prefix length (191 chars) to VARCHAR columns longer than 191 to stay under limit
      // Match: CREATE [UNIQUE] INDEX name ON table (col1, col2, ...)
      const match = createSql.match(/\((.*?)\)(?:\s|$)/);
      if (match) {
        const columns = match[1];

        // Get column info for the table
        const columnInfo = await knex(tableName).columnInfo();

        // Process each column in the index
        const processedColumns = columns.split(',').map((col: string) => {
          // Remove quotes/backticks and DESC/ASC keywords
          let colSpec = col.trim().replace(/[`"]/g, '');
          const colName = colSpec.replace(/\s+(DESC|ASC)$/i, '').trim();
          const info = columnInfo[colName];

          // If VARCHAR/TEXT longer than 191 chars, add prefix length
          if (info && (info as any).type) {
            const type = (info as any).type.toLowerCase();
            if (type.includes('varchar') || type.includes('text')) {
              // Check maxLength property first (SQLite returns this separately)
              const maxLength = (info as any).maxLength;
              if (maxLength && parseInt(maxLength) > 191) {
                return `\`${colName}\`(191)`;
              }

              // Also try extracting length from VARCHAR(n) in type string
              const lengthMatch = type.match(/varchar\((\d+)\)/);
              if (lengthMatch && parseInt(lengthMatch[1]) > 191) {
                return `\`${colName}\`(191)`;
              } else if (type.includes('text')) {
                // TEXT columns have no fixed length, always add prefix
                return `\`${colName}\`(191)`;
              }
            }
          }
          return `\`${colName}\``;
        }).join(', ');

        createSql = createSql.replace(/\((.*?)\)(?:\s|$)/, `(${processedColumns})`);
      }
    } else if (targetFormat === 'postgresql') {
      createSql = createSql.replace(/`/g, '"');
    }

    return createSql + ';';
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
      // Convert to MySQL syntax
      createSql = createSql
        // Normalize quotes: double quotes → backticks for identifiers
        .replace(/"(\w+)"/g, '`$1`')
        // Replace SQLite-specific functions with MySQL equivalents
        .replace(/unixepoch\(\)/g, 'UNIX_TIMESTAMP()')
        // Convert datetime(ts, 'unixepoch') → FROM_UNIXTIME(ts)
        .replace(/datetime\(([^,)]+),\s*'unixepoch'\)/g, 'FROM_UNIXTIME($1)');
    } else if (targetFormat === 'postgresql') {
      // Convert to PostgreSQL syntax
      createSql = createSql
        // PostgreSQL uses double quotes for identifiers, not backticks (smart replacement)
        // This only replaces identifier quotes, not backticks inside string literals
        .replace(/`([a-zA-Z0-9_\.\-]+)`/g, '"$1"')
        // Replace SQLite-specific functions with PostgreSQL equivalents
        .replace(/unixepoch\(\)/g, 'extract(epoch from now())::integer')
        // Convert datetime(ts, 'unixepoch') → to_timestamp(ts)
        .replace(/datetime\(([^,)]+),\s*'unixepoch'\)/g, 'to_timestamp($1)')
        // Convert GROUP_CONCAT(col, sep) → string_agg(col, sep)
        .replace(/GROUP_CONCAT\s*\(/gi, 'string_agg(')
        // Cast integer comparisons to be type-safe: column = 1 → column::integer = 1
        // This works for both boolean columns (TRUE::integer = 1) and integer enum columns
        .replace(/(\w+)\s*=\s*([01])\b/g, '$1::integer = $2');
    }

    return createSql + ';';

  } else if (client === 'mysql' || client === 'mysql2') {
    // MySQL: Use SHOW CREATE VIEW
    const result = await knex.raw(`SHOW CREATE VIEW ??`, [viewName]);
    const createSql = result[0][0]['Create View'];

    if (targetFormat === 'sqlite') {
      // Convert MySQL to SQLite
      return createSql
        .replace(/`/g, '"')
        .replace(/UNIX_TIMESTAMP\(\)/g, 'unixepoch()')
        + ';';
    } else if (targetFormat === 'postgresql') {
      // Convert MySQL to PostgreSQL (smart backtick replacement)
      return createSql
        .replace(/`([a-zA-Z0-9_\.\-]+)`/g, '"$1"')
        .replace(/UNIX_TIMESTAMP\(\)/g, 'extract(epoch from now())::integer')
        + ';';
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
      return createSql.replace(/"/g, '`') + ';';
    } else if (targetFormat === 'sqlite') {
      return createSql
        .replace(/extract\(epoch from now\(\)\)::integer/g, 'unixepoch()')
        + ';';
    }

    return createSql + ';';
  }

  throw new Error(`Unsupported database client: ${client}`);
}

/**
 * Quote identifier (table or column name) for the target database
 */
export function quoteIdentifier(name: string, format: DatabaseFormat): string {
  switch (format) {
    case 'mysql':
      return `\`${name}\``;
    case 'postgresql':
    case 'sqlite':
      return `"${name}"`;
    default:
      return `"${name}"`;
  }
}

/**
 * Convert backtick-quoted identifiers to double-quoted identifiers
 * Only replaces backticks that are identifier quotes, not those inside string literals
 */
function convertBackticksToDoubleQuotes(sql: string): string {
  // Match backtick-quoted identifiers: `identifier`
  // Only matches word characters, dots, hyphens, and underscores (valid identifier chars)
  return sql.replace(/`([a-zA-Z0-9_\.\-]+)`/g, '"$1"');
}

/**
 * Format a value for SQL insertion
 */
export function formatValue(value: any, format: DatabaseFormat, table?: string, column?: string, columnType?: string): string {
  // Handle NULL
  if (value === null || value === undefined) {
    return 'NULL';
  }

  // Special case: knex_migrations.migration_time
  // Convert Unix timestamp (milliseconds) to datetime/timestamp string
  if (table === 'knex_migrations' && column === 'migration_time' && typeof value === 'number') {
    if (format === 'mysql') {
      const date = new Date(value);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `'${year}-${month}-${day} ${hours}:${minutes}:${seconds}'`;
    } else if (format === 'postgresql') {
      // PostgreSQL: Use to_timestamp() function
      return `to_timestamp(${value / 1000})`;  // Convert milliseconds to seconds
    }
  }

  // Handle numbers
  if (typeof value === 'number') {
    // Special case: PostgreSQL boolean columns stored as 0/1 in SQLite
    if (format === 'postgresql' && columnType === 'boolean') {
      return value === 1 ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    if (format === 'postgresql') {
      return value ? 'TRUE' : 'FALSE';
    }
    // MySQL and SQLite use 0/1
    return value ? '1' : '0';
  }

  // Handle Buffer (binary data)
  if (Buffer.isBuffer(value)) {
    if (format === 'postgresql') {
      // PostgreSQL bytea hex format
      return `'\\x${value.toString('hex')}'::bytea`;
    }
    // MySQL and SQLite hex format
    return `X'${value.toString('hex')}'`;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Escape single quotes by doubling them
    const escaped = value.replace(/'/g, "''");
    // Also escape backslashes for MySQL
    const finalEscaped = format === 'mysql' ? escaped.replace(/\\/g, '\\\\') : escaped;
    return `'${finalEscaped}'`;
  }

  // Handle objects/arrays (JSON)
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }

  // Fallback
  return 'NULL';
}

/**
 * Convert value with type-aware conversion for cross-database migration
 */
function convertValueWithType(
  value: any,
  columnType: string | undefined,
  format: DatabaseFormat
): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  // Boolean conversion: SQLite stores as 0/1, PostgreSQL needs TRUE/FALSE
  if (columnType && (columnType.toLowerCase().includes('bool') || columnType.toLowerCase() === 'tinyint')) {
    if (format === 'postgresql') {
      // Convert 0/1 to FALSE/TRUE for PostgreSQL
      return value ? 'TRUE' : 'FALSE';
    }
    // MySQL/SQLite can handle 0/1
    return String(value);
  }

  // Timestamp/DateTime conversion: SQLite stores as INTEGER (Unix epoch)
  if (columnType && (columnType.toLowerCase().includes('timestamp') || columnType.toLowerCase().includes('datetime'))) {
    if (typeof value === 'number') {
      // Unix timestamp (milliseconds) to ISO 8601
      const date = new Date(value);
      const isoString = date.toISOString().replace('T', ' ').replace('Z', '');

      if (format === 'postgresql') {
        return `'${isoString}'::timestamp`;
      }
      return `'${isoString}'`;
    }
  }

  // Default: use existing formatValue()
  return formatValue(value, format);
}

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
  columnNames?: string[]
): string {
  if (format === 'postgresql') {
    // PostgreSQL: $1, $2, ... (replace in reverse order to avoid $10 matching $1)
    let result = sql;
    for (let i = bindings.length; i >= 1; i--) {
      const placeholder = `$${i}`;
      // For multi-row inserts, column names repeat: $1-$5 map to cols 0-4, $6-$10 map to cols 0-4, etc.
      const columnIndex = columnNames && columnNames.length > 0 ? (i - 1) % columnNames.length : i - 1;
      const columnName = columnNames?.[columnIndex];
      const columnType = columnName ? columnTypes?.get(columnName) : undefined;
      const value = convertValueWithType(bindings[i - 1], columnType, format);
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
      const columnName = columnNames?.[columnIndex];
      const columnType = columnName ? columnTypes?.get(columnName) : undefined;
      const value = convertValueWithType(bindings[bindingIndex], columnType, format);
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
          const embedded = embedBindings(ignoreSql, bindings, format, columnTypes, columnNames);
          statements.push(embedded + ';');
          continue;
        } else if (format === 'postgresql') {
          // PostgreSQL: ON CONFLICT DO NOTHING
          // Note: Knex's onConflict() requires specifying columns, so we use raw SQL
          const { sql, bindings } = builder.toSQL().toNative();
          const conflictSql = sql + ' ON CONFLICT DO NOTHING';
          const columnNames = extractColumnNamesFromInsertSql(conflictSql);
          const embedded = embedBindings(conflictSql, bindings, format, columnTypes, columnNames);
          statements.push(embedded + ';');
          continue;
        } else {
          // SQLite: INSERT OR IGNORE
          const { sql, bindings} = builder.toSQL().toNative();
          const ignoreSql = sql.replace(/^insert into/i, 'INSERT OR IGNORE INTO');
          const columnNames = extractColumnNamesFromInsertSql(ignoreSql);
          const embedded = embedBindings(ignoreSql, bindings, format, columnTypes, columnNames);
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
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames);
          statements.push(embedded + ';');
        } else if (format === 'postgresql') {
          // PostgreSQL: ON CONFLICT DO UPDATE
          const quotedPks = primaryKeys.map(pk => quoteIdentifier(pk, format));
          const updateClauses = nonPkColumns.map(col => `${quoteIdentifier(col, format)} = EXCLUDED.${quoteIdentifier(col, format)}`);
          const finalSql = `${sql}\nON CONFLICT (${quotedPks.join(', ')}) DO UPDATE SET\n  ${updateClauses.join(',\n  ')}`;
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames);
          statements.push(embedded + ';');
        } else {
          // SQLite: ON CONFLICT DO UPDATE
          const quotedPks = primaryKeys.map(pk => quoteIdentifier(pk, format));
          const updateClauses = nonPkColumns.map(col => `${quoteIdentifier(col, format)} = excluded.${quoteIdentifier(col, format)}`);
          const finalSql = `${sql}\nON CONFLICT (${quotedPks.join(', ')}) DO UPDATE SET\n  ${updateClauses.join(',\n  ')}`;
          const embedded = embedBindings(finalSql, bindings, format, columnTypes, columnNames);
          statements.push(embedded + ';');
        }
      } else {
        // ERROR mode: Standard INSERT
        const { sql, bindings } = builder.toSQL().toNative();
        const columnNames = extractColumnNamesFromInsertSql(sql);
        const embedded = embedBindings(sql, bindings, format, columnTypes, columnNames);
        statements.push(embedded + ';');
      }
    }

    return statements;
  } finally {
    // Clean up Knex instance
    targetKnex.destroy();
  }
}

/**
 * Generate header comments for SQL dump
 */
export function generateHeader(format: DatabaseFormat): string {
  const timestamp = new Date().toISOString();
  return `-- SQL Dump generated by sqlew
-- Date: ${timestamp}
-- Target: ${format.toUpperCase()}
--
-- This dump is wrapped in a transaction.
-- On error, all changes will be rolled back automatically.
--
-- Usage (empty database):
--   ${format === 'mysql' ? 'mysql mydb < dump.sql' : format === 'postgresql' ? 'psql -d mydb -f dump.sql' : 'sqlite3 mydb.db < dump.sql'}

`;
}

/**
 * Generate foreign key disable/enable statements
 */
export function generateForeignKeyControls(format: DatabaseFormat, enable: boolean): string {
  if (format === 'mysql') {
    return enable
      ? 'SET FOREIGN_KEY_CHECKS=1;'
      : 'SET FOREIGN_KEY_CHECKS=0;';
  } else if (format === 'postgresql') {
    return enable
      ? 'SET session_replication_role = DEFAULT;'
      : 'SET session_replication_role = replica;';
  } else {
    // SQLite
    return enable
      ? 'PRAGMA foreign_keys = ON;'
      : 'PRAGMA foreign_keys = OFF;';
  }
}

/**
 * Generate transaction control statements
 */
export function generateTransactionControl(format: DatabaseFormat, isStart: boolean): string {
  if (isStart) {
    return format === 'mysql' ? 'START TRANSACTION;'
         : format === 'postgresql' ? 'BEGIN;'
         : 'BEGIN TRANSACTION;';
  } else {
    return 'COMMIT;';
  }
}

/**
 * Generate sequence reset statements for PostgreSQL
 */
export async function generateSequenceResets(knex: Knex, tables: string[]): Promise<string[]> {
  const statements: string[] = [];

  for (const table of tables) {
    try {
      // Check if table has an id column with a sequence
      const result = await knex.raw(`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_name = ?
        AND column_default LIKE 'nextval%'
      `, [table]);

      if (result.rows.length > 0) {
        const columnName = result.rows[0].column_name;
        const sequenceName = `${table}_${columnName}_seq`;
        statements.push(
          `SELECT setval('${sequenceName}', COALESCE((SELECT MAX(${columnName}) FROM "${table}"), 1), true);`
        );
      }
    } catch (err) {
      // Ignore errors for tables without sequences
    }
  }

  return statements;
}

/**
 * Get foreign key dependencies for tables
 * Returns a map of table -> array of tables it depends on
 */
async function getTableDependencies(knex: Knex, tables: string[]): Promise<Map<string, string[]>> {
  const dependencies = new Map<string, string[]>();
  const client = knex.client.config.client;

  for (const table of tables) {
    dependencies.set(table, []);
  }

  for (const table of tables) {
    try {
      if (client === 'better-sqlite3' || client === 'sqlite3') {
        // SQLite: Parse foreign keys from CREATE TABLE statement
        const result = await knex.raw(`
          SELECT sql FROM sqlite_master
          WHERE type='table' AND name=?
        `, [table]);

        if (result.length > 0 && result[0].sql) {
          const sql = result[0].sql;
          // Match FOREIGN KEY (...) REFERENCES table_name
          // SQLite uses backticks, double quotes, or no quotes for identifiers
          const fkRegex = /FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[`"]?(\w+)[`"]?/gi;
          let match;
          while ((match = fkRegex.exec(sql)) !== null) {
            const referencedTable = match[1];
            if (tables.includes(referencedTable) && referencedTable !== table) {
              dependencies.get(table)!.push(referencedTable);
            }
          }
        }
      } else if (client === 'mysql' || client === 'mysql2') {
        // MySQL: Use information_schema
        const result = await knex.raw(`
          SELECT REFERENCED_TABLE_NAME
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
        `, [table]);

        for (const row of result[0]) {
          const referencedTable = row.REFERENCED_TABLE_NAME;
          if (tables.includes(referencedTable) && referencedTable !== table) {
            dependencies.get(table)!.push(referencedTable);
          }
        }
      } else if (client === 'pg') {
        // PostgreSQL: Use information_schema
        const result = await knex.raw(`
          SELECT DISTINCT ccu.table_name AS referenced_table
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = ?
        `, [table]);

        for (const row of result.rows) {
          const referencedTable = row.referenced_table;
          if (tables.includes(referencedTable) && referencedTable !== table) {
            dependencies.get(table)!.push(referencedTable);
          }
        }
      }
    } catch (err) {
      // Ignore errors - table might not have foreign keys
    }
  }

  return dependencies;
}

/**
 * Topologically sort tables by foreign key dependencies
 * Returns tables in order where parent tables come before child tables
 */
function topologicalSort(tables: string[], dependencies: Map<string, string[]>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(table: string) {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      // Circular dependency detected - just continue
      return;
    }

    visiting.add(table);
    const deps = dependencies.get(table) || [];
    for (const dep of deps) {
      visit(dep);
    }
    visiting.delete(table);
    visited.add(table);
    sorted.push(table);
  }

  for (const table of tables) {
    visit(table);
  }

  return sorted;
}

/**
 * Main function to generate complete SQL dump
 */
export async function generateSqlDump(
  knex: Knex,
  format: DatabaseFormat,
  options: {
    tables?: string[];
    includeHeader?: boolean;
    includeSchema?: boolean;
    chunkSize?: number;
    conflictMode?: ConflictMode;
  } = {}
): Promise<string> {
  const {
    tables: requestedTables,
    includeHeader = true,
    includeSchema = true,  // Default to TRUE - include schema
    chunkSize = 100,
    conflictMode = 'error'
  } = options;

  const statements: string[] = [];

  // Add header
  if (includeHeader) {
    statements.push(generateHeader(format));
  }

  // Disable foreign key checks
  statements.push(generateForeignKeyControls(format, false));
  statements.push('');

  // Start transaction
  statements.push(generateTransactionControl(format, true));
  statements.push('');

  // Get tables to dump
  // Include knex_migrations table when schema is included for complete migration state
  const allTables = await getAllTables(knex, includeSchema);
  const tablesToDump = requestedTables
    ? allTables.filter(t => requestedTables.includes(t))
    : allTables;

  // Sort tables by foreign key dependencies for PostgreSQL compatibility
  // Parent tables must be created before child tables
  const dependencies = await getTableDependencies(knex, tablesToDump);
  const sortedTables = topologicalSort(tablesToDump, dependencies);

  // Generate CREATE TABLE statements if schema is included
  if (includeSchema) {
    statements.push('-- ============================================');
    statements.push('-- Schema (CREATE TABLE statements)');
    statements.push('-- ============================================');
    statements.push('');

    for (const table of sortedTables) {
      try {
        const createSql = await getCreateTableStatement(knex, table, format);
        statements.push(`-- Table: ${table}`);
        statements.push(createSql);
        statements.push('');
      } catch (err) {
        console.warn(`Warning: Could not get CREATE TABLE for ${table}:`, err);
        statements.push(`-- Warning: Could not create table ${table}`);
        statements.push('');
      }
    }

    // Generate CREATE VIEW statements
    try {
      const views = await getAllViews(knex);
      if (views.length > 0) {
        statements.push('-- ============================================');
        statements.push('-- Views');
        statements.push('-- ============================================');
        statements.push('');

        for (const view of views) {
          try {
            const createViewSql = await getCreateViewStatement(knex, view, format);
            statements.push(`-- View: ${view}`);
            statements.push(createViewSql);
            statements.push('');
          } catch (err) {
            console.warn(`Warning: Could not get CREATE VIEW for ${view}:`, err);
            statements.push(`-- Warning: Could not create view ${view}`);
            statements.push('');
          }
        }
      }
    } catch (err) {
      console.warn('Warning: Could not retrieve views:', err);
    }

    // Generate CREATE INDEX statements
    try {
      const indexStatements: string[] = [];
      for (const table of sortedTables) {
        const indexes = await getAllIndexes(knex, table);
        if (indexes.length > 0) {
          for (const indexName of indexes) {
            try {
              const createIndexSql = await getCreateIndexStatement(knex, indexName, format);
              indexStatements.push(`-- Index: ${indexName} on ${table}`);
              indexStatements.push(createIndexSql);
              indexStatements.push('');
            } catch (err) {
              console.warn(`Warning: Could not get CREATE INDEX for ${indexName}:`, err);
            }
          }
        }
      }

      if (indexStatements.length > 0) {
        statements.push('-- ============================================');
        statements.push('-- Indexes');
        statements.push('-- ============================================');
        statements.push('');
        statements.push(...indexStatements);
      }
    } catch (err) {
      console.warn('Warning: Could not retrieve indexes:', err);
    }

    statements.push('-- ============================================');
    statements.push('-- Data (INSERT statements)');
    statements.push('-- ============================================');
    statements.push('');
  }

  // Generate INSERT statements for each table (in dependency order)
  // Skip data insertion if chunkSize is 0 (schema-only mode)
  if (chunkSize > 0) {
    for (const table of sortedTables) {
      statements.push(`-- Data for table: ${table}`);

      const rows = await knex(table).select('*');

    if (rows.length === 0) {
      statements.push(`-- No data in table ${table}`);
      statements.push('');
      continue;
    }

    // Get column types for cross-database type conversion
    // Query from source database to understand original types (e.g., INTEGER for booleans in SQLite)
    let columnTypes: Map<string, string> = new Map();
    try {
      const columnInfo = await knex(table).columnInfo();
      for (const [col, info] of Object.entries(columnInfo)) {
        columnTypes.set(col, (info as any).type);
      }
    } catch (err) {
      console.warn(`Warning: Could not get column types for table ${table}:`, err);
    }

    // Get primary keys if using replace mode
    let primaryKeys: string[] = [];
    if (conflictMode === 'replace') {
      try {
        primaryKeys = await getPrimaryKeyColumns(knex, table);
        if (primaryKeys.length > 0) {
          statements.push(`-- Primary key(s): ${primaryKeys.join(', ')}`);
        }
      } catch (err) {
        console.warn(`Warning: Could not detect primary key for table ${table}:`, err);
      }
    }

    const inserts = generateBulkInsert(table, rows, format, {
      chunkSize,
      conflictMode,
      primaryKeys,
      columnTypes
    });
    statements.push(...inserts);
    statements.push('');
    }
  } // End of if (chunkSize > 0)

  // Reset sequences for PostgreSQL
  if (format === 'postgresql') {
    statements.push('-- Reset sequences');
    const sequenceResets = await generateSequenceResets(knex, tablesToDump);
    statements.push(...sequenceResets);
    statements.push('');
  }

  // Commit transaction
  statements.push(generateTransactionControl(format, false));
  statements.push('');

  // Re-enable foreign key checks
  statements.push(generateForeignKeyControls(format, true));

  return statements.join('\n');
}
