// sql-dump.ts - Utility functions for generating SQL dump files

import type { Knex } from 'knex';
import knex from 'knex';
import {
  convertIdentifierQuotes,
  convertAutoIncrement,
  convertTimestampFunctions,
  convertBooleanDefaults,
  convertDataTypes,
  removeCheckConstraints,
  removeSqliteDefaultFunctions,
  type DatabaseFormat,
} from './sql-dump-converters.js';

export type { DatabaseFormat };
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
      // Convert to MySQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'mysql');
      createSql = convertAutoIncrement(createSql, 'sqlite', 'mysql');
      createSql = convertDataTypes(createSql, 'mysql');
      createSql = removeCheckConstraints(createSql);
      createSql = removeSqliteDefaultFunctions(createSql);

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
      // Convert to PostgreSQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
      createSql = convertAutoIncrement(createSql, 'sqlite', 'postgresql');
      createSql = convertDataTypes(createSql, 'postgresql');
      createSql = convertBooleanDefaults(createSql, 'postgresql');
      createSql = removeSqliteDefaultFunctions(createSql);
    }

    return createSql + ';';

  } else if (client === 'mysql' || client === 'mysql2') {
    // MySQL: Use SHOW CREATE TABLE
    const result = await knex.raw(`SHOW CREATE TABLE ??`, [table]);
    let createSql = result[0][0]['Create Table'];

    if (targetFormat === 'sqlite') {
      // Convert to SQLite syntax using shared converters
      createSql = convertAutoIncrement(createSql, 'mysql', 'sqlite');
      createSql = createSql.replace(/ENGINE=\w+/gi, '');
      createSql = createSql.replace(/DEFAULT CHARSET=\w+/gi, '');
      return createSql + ';';
    } else if (targetFormat === 'postgresql') {
      // Convert to PostgreSQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
      createSql = convertAutoIncrement(createSql, 'mysql', 'postgresql');
      createSql = createSql.replace(/ENGINE=\w+/gi, '');
      return createSql + ';';
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
    // PostgreSQL: Reconstruct from information_schema + pg_catalog
    // Complete implementation with constraints and indexes
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
        // Handle nextval sequences (SERIAL columns)
        if (col.column_default.includes('nextval')) {
          // Skip - SERIAL/IDENTITY already handled in data_type
        } else {
          def += ` DEFAULT ${col.column_default}`;
        }
      }
      return def;
    });

    // Get PRIMARY KEY constraint
    const pkResult = await knex.raw(`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ?::regclass AND i.indisprimary
      ORDER BY a.attnum
    `, [table]);

    if (pkResult.rows.length > 0) {
      const pkColumns = pkResult.rows.map((r: any) => `"${r.column_name}"`).join(', ');
      columnDefs.push(`PRIMARY KEY (${pkColumns})`);
    }

    // Get FOREIGN KEY constraints
    const fkResult = await knex.raw(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ?
      ORDER BY tc.constraint_name
    `, [table]);

    for (const fk of fkResult.rows) {
      let fkDef = `FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}"("${fk.foreign_column_name}")`;
      if (fk.update_rule && fk.update_rule !== 'NO ACTION') {
        fkDef += ` ON UPDATE ${fk.update_rule}`;
      }
      if (fk.delete_rule && fk.delete_rule !== 'NO ACTION') {
        fkDef += ` ON DELETE ${fk.delete_rule}`;
      }
      columnDefs.push(fkDef);
    }

    // Get UNIQUE constraints (excluding PRIMARY KEY)
    const uniqueResult = await knex.raw(`
      SELECT
        tc.constraint_name,
        STRING_AGG(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS column_names
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_name = ?
      GROUP BY tc.constraint_name
      ORDER BY tc.constraint_name
    `, [table]);

    for (const unique of uniqueResult.rows) {
      const uniqueColumns = unique.column_names.split(',').map((col: string) => `"${col.trim()}"`).join(', ');
      columnDefs.push(`UNIQUE (${uniqueColumns})`);
    }

    let createSql = `CREATE TABLE "${table}" (\n  ${columnDefs.join(',\n  ')}\n)`;

    // Apply cross-database conversions using shared converters
    if (targetFormat === 'mysql') {
      createSql = convertIdentifierQuotes(createSql, 'mysql');
      createSql = convertAutoIncrement(createSql, 'postgresql', 'mysql');
      createSql = convertDataTypes(createSql, 'mysql');
      createSql = convertTimestampFunctions(createSql, 'mysql');
      return createSql + ';';
    } else if (targetFormat === 'sqlite') {
      createSql = convertIdentifierQuotes(createSql, 'sqlite');
      createSql = convertAutoIncrement(createSql, 'postgresql', 'sqlite');
      createSql = convertDataTypes(createSql, 'sqlite');
      createSql = convertTimestampFunctions(createSql, 'sqlite');
      return createSql + ';';
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
      createSql = convertIdentifierQuotes(createSql, 'mysql');

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
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
    }

    return createSql + ';';
  } else if (client === 'mysql' || client === 'mysql2') {
    // For MySQL, we need to find which table the index belongs to
    // First, get all tables and search for the index
    const tablesResult = await knex.raw('SHOW TABLES');
    const tableKey = Object.keys(tablesResult[0][0])[0];
    const tables = tablesResult[0].map((row: any) => row[tableKey]);

    let indexInfo = null;
    let tableName = '';

    // Search for the index in all tables
    for (const table of tables) {
      const result = await knex.raw(`SHOW INDEXES FROM ?? WHERE Key_name = ?`, [table, indexName]);
      if (result[0].length > 0) {
        indexInfo = result[0];
        tableName = table;
        break;
      }
    }

    if (!indexInfo || indexInfo.length === 0) {
      throw new Error(`Index ${indexName} not found`);
    }

    const isUnique = indexInfo[0].Non_unique === 0;

    // Get column info for prefix length handling
    const columnInfo = await knex(tableName).columnInfo();

    // Build column list with proper prefix lengths
    const columns = indexInfo.map((row: any) => {
      const colName = row.Column_name;
      const colMeta = columnInfo[colName];

      // Handle prefix length for long VARCHAR/TEXT columns
      if (colMeta && (colMeta as any).type) {
        const type = (colMeta as any).type.toLowerCase();
        if (type.includes('varchar') || type.includes('text')) {
          const maxLength = (colMeta as any).maxLength;
          // Extract length from type string like "varchar(255)"
          const lengthMatch = type.match(/varchar\((\d+)\)/);
          const typeLength = lengthMatch ? parseInt(lengthMatch[1]) : null;

          if ((maxLength && parseInt(maxLength) > 191) || (typeLength && typeLength > 191) || type.includes('text')) {
            return `\`${colName}\`(191)`;
          }
        }
      }
      return `\`${colName}\``;
    }).join(', ');

    const uniqueStr = isUnique ? 'UNIQUE ' : '';
    let createSql = `CREATE ${uniqueStr}INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`;

    // Apply cross-database conversion
    if (targetFormat === 'postgresql') {
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
    } else if (targetFormat === 'sqlite') {
      createSql = convertIdentifierQuotes(createSql, 'sqlite');
      // Remove prefix lengths for SQLite (not supported)
      createSql = createSql.replace(/\(191\)/g, '');
    }

    return createSql + ';';
  } else if (client === 'pg') {
    // Get index definition from PostgreSQL
    const result = await knex.raw(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ?
    `, [indexName]);

    if (result.rows.length === 0) {
      throw new Error(`Index ${indexName} not found`);
    }

    let createSql = result.rows[0].indexdef;

    // Apply cross-database conversion
    if (targetFormat === 'mysql') {
      createSql = convertIdentifierQuotes(createSql, 'mysql');

      // Handle prefix length for MySQL
      // Extract table name from the CREATE INDEX statement
      const tableMatch = createSql.match(/ON\s+(["`]?\w+["`]?)/i);
      if (tableMatch) {
        const tableName = tableMatch[1].replace(/["`]/g, '');
        const columnInfo = await knex(tableName).columnInfo();

        // Find column list in the index definition
        const colMatch = createSql.match(/\((.*?)\)(?:\s|$)/);
        if (colMatch) {
          const columns = colMatch[1];
          const processedColumns = columns.split(',').map((col: string) => {
            const colName = col.trim().replace(/["`]/g, '').replace(/\s+(DESC|ASC)$/i, '').trim();
            const info = columnInfo[colName];

            if (info && (info as any).type) {
              const type = (info as any).type.toLowerCase();
              if (type.includes('varchar') || type.includes('text')) {
                const maxLength = (info as any).maxLength;
                const lengthMatch = type.match(/varchar\((\d+)\)/);
                const typeLength = lengthMatch ? parseInt(lengthMatch[1]) : null;

                if ((maxLength && parseInt(maxLength) > 191) || (typeLength && typeLength > 191) || type.includes('text')) {
                  return `\`${colName}\`(191)`;
                }
              }
            }
            return `\`${colName}\``;
          }).join(', ');

          createSql = createSql.replace(/\((.*?)\)(?:\s|$)/, `(${processedColumns})`);
        }
      }
    } else if (targetFormat === 'sqlite') {
      createSql = convertIdentifierQuotes(createSql, 'sqlite');
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
      // Convert to MySQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'mysql');
      createSql = convertTimestampFunctions(createSql, 'mysql');
    } else if (targetFormat === 'postgresql') {
      // Convert to PostgreSQL syntax using shared converters
      createSql = convertIdentifierQuotes(createSql, 'postgresql');
      createSql = convertTimestampFunctions(createSql, 'postgresql');
      // Convert GROUP_CONCAT(col, sep) → string_agg(col, sep)
      createSql = createSql.replace(/GROUP_CONCAT\s*\(/gi, 'string_agg(');
      // Cast integer comparisons to be type-safe: column = 1 → column::integer = 1
      // This works for both boolean columns (TRUE::integer = 1) and integer enum columns
      createSql = createSql.replace(/(\w+)\s*=\s*([01])\b/g, '$1::integer = $2');
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
 * Uses Knex columnInfo() metadata for accurate type detection
 *
 * @internal - Exported for testing only
 */
export function convertValueWithType(
  value: any,
  columnName: string,
  columnInfo: Map<string, any>, // From knex(table).columnInfo()
  sourceFormat: DatabaseFormat,
  targetFormat: DatabaseFormat
): string {
  // Handle NULL
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const colMeta = columnInfo.get(columnName);
  if (!colMeta) {
    // Fallback to basic formatValue
    return formatValue(value, targetFormat);
  }

  const colType = (colMeta.type || '').toLowerCase();

  // Boolean conversion - enhanced detection
  // Knex columnInfo types: 'boolean' (PostgreSQL), 'tinyint' (MySQL), 'integer' (SQLite boolean stored as 0/1)
  const isBooleanColumn =
    colType.includes('bool') ||
    colType === 'tinyint' ||
    colType === 'bit' ||
    colMeta.type === 'boolean' ||
    // Additional heuristic: maxLength === 1 for tinyint(1) in MySQL
    (colType === 'integer' && colMeta.maxLength === 1);

  if (isBooleanColumn) {
    // Normalize value to boolean
    const boolValue = Boolean(value);

    if (targetFormat === 'postgresql') {
      return boolValue ? 'TRUE' : 'FALSE';
    }
    // SQLite and MySQL use 0/1
    return boolValue ? '1' : '0';
  }

  // Timestamp/DateTime conversion - enhanced with columnInfo metadata
  const isTimestampColumn =
    colType.includes('timestamp') ||
    colType.includes('datetime') ||
    colType.includes('date') ||
    colType === 'time';

  if (isTimestampColumn) {
    if (typeof value === 'number') {
      // Unix timestamp - check if milliseconds or seconds based on magnitude
      const timestamp = value > 10000000000 ? value : value * 1000;
      const date = new Date(timestamp);

      // ISO 8601 format: YYYY-MM-DD HH:MM:SS
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      const isoString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      if (targetFormat === 'postgresql') {
        return `'${isoString}'::timestamp`;
      } else if (targetFormat === 'mysql') {
        return `'${isoString}'`;
      }
      return `'${isoString}'`;
    } else if (typeof value === 'string') {
      // Already formatted string - ensure proper escaping
      const escaped = value.replace(/'/g, "''");
      if (targetFormat === 'postgresql') {
        return `'${escaped}'::timestamp`;
      }
      return `'${escaped}'`;
    } else if (value instanceof Date) {
      // Date object
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      const hours = String(value.getUTCHours()).padStart(2, '0');
      const minutes = String(value.getUTCMinutes()).padStart(2, '0');
      const seconds = String(value.getUTCSeconds()).padStart(2, '0');
      const isoString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      if (targetFormat === 'postgresql') {
        return `'${isoString}'::timestamp`;
      }
      return `'${isoString}'`;
    }
  }

  // Binary/Buffer handling - enhanced with proper encoding
  const isBinaryColumn =
    colType.includes('blob') ||
    colType.includes('bytea') ||
    colType.includes('binary') ||
    colType.includes('varbinary');

  if (Buffer.isBuffer(value) || isBinaryColumn) {
    const bufferValue = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const hexString = bufferValue.toString('hex');

    if (targetFormat === 'postgresql') {
      // PostgreSQL bytea hex format: '\x...'::bytea
      return `'\\x${hexString}'::bytea`;
    } else if (targetFormat === 'mysql') {
      // MySQL binary hex format: X'...' or 0x...
      return `X'${hexString}'`;
    }
    // SQLite hex format
    return `X'${hexString}'`;
  }

  // JSON handling - enhanced with proper type casting
  const isJsonColumn =
    colType.includes('json') ||
    colType === 'jsonb';

  if (isJsonColumn) {
    let jsonStr: string;
    if (typeof value === 'string') {
      // Already stringified by Knex - validate and escape
      try {
        JSON.parse(value); // Validate
        jsonStr = value.replace(/'/g, "''");
      } catch {
        // Invalid JSON string - treat as regular string
        jsonStr = JSON.stringify(value).replace(/'/g, "''");
      }
    } else if (typeof value === 'object') {
      // Object that needs stringification
      jsonStr = JSON.stringify(value).replace(/'/g, "''");
    } else {
      // Primitive value - stringify
      jsonStr = JSON.stringify(value).replace(/'/g, "''");
    }

    if (targetFormat === 'postgresql') {
      // Use JSONB for better performance
      return `'${jsonStr}'::jsonb`;
    } else if (targetFormat === 'mysql') {
      // MySQL 5.7+ JSON type
      return `'${jsonStr}'`;
    }
    // SQLite stores JSON as TEXT
    return `'${jsonStr}'`;
  }

  // PostgreSQL Arrays - enhanced detection
  const isArrayColumn = colType.includes('array') || colType.includes('[]');

  if ((isArrayColumn || Array.isArray(value)) && targetFormat === 'postgresql') {
    if (Array.isArray(value)) {
      // Convert array elements recursively
      const arrayStr = value
        .map(v => {
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'string') {
            const escaped = v.replace(/'/g, "''").replace(/\\/g, '\\\\');
            return `'${escaped}'`;
          }
          if (typeof v === 'number') return String(v);
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          // Objects - stringify
          return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        })
        .join(',');
      return `ARRAY[${arrayStr}]`;
    } else if (typeof value === 'string') {
      // Already formatted array string - pass through
      return value;
    }
  }

  // PostgreSQL Enum types
  const isEnumColumn = colType === 'enum' || colType.includes('user-defined');
  if (isEnumColumn && targetFormat === 'postgresql') {
    // Enum values must be quoted strings
    const escaped = String(value).replace(/'/g, "''");
    return `'${escaped}'`;
  }

  // Text columns with object values (fallback)
  if (colType === 'text' && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }

  // Numeric types - ensure no quotes
  const isNumericColumn =
    colType.includes('int') ||
    colType.includes('decimal') ||
    colType.includes('numeric') ||
    colType.includes('real') ||
    colType.includes('float') ||
    colType.includes('double');

  if (isNumericColumn && typeof value === 'number') {
    return String(value);
  }

  // Fallback to basic formatValue
  return formatValue(value, targetFormat);
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
    let columnInfoMap: Map<string, any> = new Map();
    try {
      const columnInfo = await knex(table).columnInfo();
      for (const [col, info] of Object.entries(columnInfo)) {
        columnTypes.set(col, (info as any).type);
        columnInfoMap.set(col, info);  // Store full column metadata
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
      columnTypes,
      columnInfo: columnInfoMap  // Pass full columnInfo for type-aware conversion
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
