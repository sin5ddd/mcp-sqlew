// schema/tables.ts - Table detection and CREATE TABLE statement generation

import type { Knex } from 'knex';
import { SchemaInspector } from 'knex-schema-inspector';
import type { Column } from 'knex-schema-inspector/dist/types/column.js';
import type { ForeignKey } from 'knex-schema-inspector/dist/types/foreign-key.js';
import type { DatabaseFormat } from '../types.js';
import { quoteIdentifier } from '../formatters/identifiers.js';
import { debugLog } from '../../debug-logger.js';

/**
 * Convert data type from source format to target format using metadata
 */
function convertDataType(columnType: string, targetFormat: DatabaseFormat, maxLength?: number | null): string {
  const upperType = columnType.toUpperCase();

  if (targetFormat === 'mysql') {
    // MySQL-specific conversions
    if (upperType.includes('SERIAL') || upperType.includes('BIGSERIAL')) {
      return 'BIGINT AUTO_INCREMENT';
    }
    if (upperType.includes('TEXT')) {
      return 'TEXT';
    }
    if (upperType.includes('VARCHAR')) {
      // Use maxLength from metadata
      const length = maxLength && maxLength <= 191 ? maxLength : 191;
      return `VARCHAR(${length})`;
    }
    if (upperType.includes('TIMESTAMP') || upperType.includes('TIMESTAMPTZ')) {
      return 'DATETIME';
    }
    if (upperType.includes('BOOLEAN') || upperType === 'BOOL') {
      return 'TINYINT(1)';
    }
    if (upperType === 'INTEGER' || upperType === 'INT') {
      return 'INT';
    }
    if (upperType.includes('BIGINT')) {
      return 'BIGINT';
    }
  } else if (targetFormat === 'postgresql') {
    // PostgreSQL-specific conversions
    if (upperType.includes('AUTOINCREMENT') || upperType.includes('AUTO_INCREMENT')) {
      return 'SERIAL';
    }
    if (upperType.includes('DATETIME')) {
      return 'TIMESTAMP';
    }
    if (upperType.includes('TINYINT') || upperType === 'BIT') {
      return 'BOOLEAN';
    }
    if (upperType.includes('TEXT')) {
      return 'TEXT';
    }
    if (upperType.includes('VARCHAR')) {
      const length = maxLength || 255;
      return `VARCHAR(${length})`;
    }
  } else if (targetFormat === 'sqlite') {
    // SQLite-specific conversions
    if (upperType.includes('SERIAL') || upperType.includes('AUTO_INCREMENT') || upperType.includes('AUTOINCREMENT')) {
      return 'INTEGER';
    }
    if (upperType.includes('VARCHAR') || upperType.includes('TEXT')) {
      return 'TEXT';
    }
    if (upperType.includes('TINYINT') || upperType.includes('BOOLEAN')) {
      return 'INTEGER';
    }
    if (upperType.includes('DATETIME') || upperType.includes('TIMESTAMP')) {
      return 'INTEGER'; // SQLite stores as Unix timestamp
    }
  }

  // Default: return as-is
  return columnType;
}

/**
 * Convert default value from SQLite functions to target format
 * Handles: unixepoch() → UNIX_TIMESTAMP() / EXTRACT(epoch FROM NOW())
 *         strftime() → DATE_FORMAT() / TO_CHAR()
 *
 * PostgreSQL-specific: Skip nextval() sequences (auto-increment, should use SERIAL)
 */
function convertDefaultValue(defaultValue: string | null, targetFormat: DatabaseFormat): string | null {
  if (!defaultValue) {
    return null;
  }

  const lower = defaultValue.toLowerCase().trim();

  // PostgreSQL: Skip nextval() sequences (SERIAL columns handle auto-increment)
  // Example: nextval('table_id_seq'::regclass)
  if (lower.includes('nextval')) {
    return null; // Skip DEFAULT - column should use SERIAL type instead
  }

  // SQLite unixepoch() conversions
  if (lower.includes('unixepoch()') || lower === 'unixepoch()') {
    if (targetFormat === 'mysql') {
      // MySQL 8.0+: Use CAST to explicitly convert UNIX_TIMESTAMP() to SIGNED INTEGER
      // Wrapped in parentheses for expression syntax
      return '(CAST(UNIX_TIMESTAMP() AS SIGNED))';
    } else if (targetFormat === 'postgresql') {
      return 'EXTRACT(epoch FROM NOW())::INTEGER';
    }
    return null; // Remove for SQLite
  }

  // SQLite strftime('%s', 'now') - Unix timestamp (INTEGER)
  // Must check BEFORE generic strftime to handle this specific case
  if (lower.includes("strftime('%s'") || lower.includes('strftime("%s"')) {
    if (targetFormat === 'mysql') {
      // MySQL 8.0+: Use CAST to explicitly convert UNIX_TIMESTAMP() to SIGNED INTEGER
      // Wrapped in parentheses for expression syntax
      return '(CAST(UNIX_TIMESTAMP() AS SIGNED))';
    } else if (targetFormat === 'postgresql') {
      return 'EXTRACT(epoch FROM NOW())::INTEGER';
    }
    return null;
  }

  // MySQL UNIX_TIMESTAMP() - already MySQL syntax, needs CAST wrapping
  // Match both "unix_timestamp()" and "UNIX_TIMESTAMP()" case-insensitively
  if (lower.includes('unix_timestamp')) {
    if (targetFormat === 'mysql') {
      // MySQL 8.0+: Wrap UNIX_TIMESTAMP() with CAST for type safety
      return '(CAST(UNIX_TIMESTAMP() AS SIGNED))';
    } else if (targetFormat === 'postgresql') {
      return 'EXTRACT(epoch FROM NOW())::INTEGER';
    } else if (targetFormat === 'sqlite') {
      return 'unixepoch()';
    }
    return null;
  }

  // SQLite strftime conversions (datetime formats)
  if (lower.includes('strftime')) {
    if (targetFormat === 'mysql') {
      // strftime('%Y-%m-%d %H:%M:%S', 'now') → NOW()
      return 'NOW()';
    } else if (targetFormat === 'postgresql') {
      return 'NOW()';
    }
    return null;
  }

  // Remove parentheses for simple values
  let cleanValue = defaultValue;
  if (lower.startsWith('(') && lower.endsWith(')')) {
    cleanValue = defaultValue.substring(1, defaultValue.length - 1);
  }

  // For numeric defaults, normalize floating point values
  // Remove trailing .0 (e.g., 1.0 → 1) to avoid type mismatches
  const trimmed = cleanValue.trim();
  if (/^\d+\.0+$/.test(trimmed)) {
    return trimmed.replace(/\.0+$/, '');
  }

  // Quote string literals if not already quoted and not a number
  if (!/^['"]/.test(trimmed) && !/^-?\d+(\.\d+)?$/.test(trimmed) && !/^(true|false|null|current_timestamp|now\(\)|unix_timestamp\(\))$/i.test(trimmed)) {
    return `'${trimmed}'`;
  }

  return trimmed;
}

/**
 * Build column definition from Column metadata
 */
function buildColumnDefinition(col: Column, targetFormat: DatabaseFormat): string {
  const quotedName = quoteIdentifier(col.name, targetFormat);
  let dataType = convertDataType(col.data_type, targetFormat, col.max_length);

  // MySQL: TEXT columns cannot be used in UNIQUE/PRIMARY KEY constraints without prefix length
  // Convert TEXT to VARCHAR(191) for utf8mb4 compatibility (768 bytes ÷ 4 bytes/char = 191)
  if (targetFormat === 'mysql' && dataType.toUpperCase() === 'TEXT') {
    if (col.is_unique || col.is_primary_key || col.foreign_key_table || (col as any).in_composite_unique) {
      dataType = 'VARCHAR(191)';
    }
  }

  let def = `${quotedName} ${dataType}`;

  // Handle NOT NULL constraint
  if (col.is_nullable === false) {
    def += ' NOT NULL';
  }

  // Handle DEFAULT value
  if (col.default_value !== null && col.default_value !== undefined) {
    let convertedDefault = convertDefaultValue(String(col.default_value), targetFormat);
    if (convertedDefault !== null && convertedDefault !== '') {
      // MySQL restrictions for DEFAULT values
      const isTextColumn = dataType.toUpperCase().includes('TEXT') || dataType.toUpperCase().includes('BLOB');
      const isFunctionCall = convertedDefault.includes('(') && convertedDefault.includes(')');
      const isIntegerColumn = dataType.toUpperCase().includes('INT');
      const isBooleanColumn = dataType.toUpperCase().includes('BOOLEAN');

      // PostgreSQL: Convert integer defaults to boolean for BOOLEAN columns
      if (targetFormat === 'postgresql' && isBooleanColumn && /^[01]$/.test(convertedDefault)) {
        convertedDefault = convertedDefault === '1' ? 'TRUE' : 'FALSE';
      }

      if (targetFormat === 'mysql') {
        // MySQL doesn't allow DEFAULT on TEXT/BLOB columns
        if (isTextColumn) {
          // Skip DEFAULT - application must handle at runtime
        }
        // MySQL DOES support certain function calls as DEFAULT for INTEGER columns
        // (e.g., UNIX_TIMESTAMP(), CURRENT_TIMESTAMP)
        // Only skip if conversion returned null (meaning function not supported)
        else {
          def += ` DEFAULT ${convertedDefault}`;
        }
      } else {
        def += ` DEFAULT ${convertedDefault}`;
      }
    }
  }

  // Handle AUTO_INCREMENT for MySQL
  // SQLite source: INTEGER PRIMARY KEY columns are implicitly auto-increment
  const isIntegerPrimaryKey = col.is_primary_key &&
    (col.data_type.toUpperCase().includes('INTEGER') || col.data_type.toUpperCase() === 'INT');
  const isAutoIncrement = col.is_generated || isIntegerPrimaryKey;

  if (targetFormat === 'mysql' && isAutoIncrement && col.generation_expression === null) {
    if (!def.includes('AUTO_INCREMENT')) {
      def += ' AUTO_INCREMENT';
    }
  }

  // Handle SERIAL for PostgreSQL (when source is MySQL/SQLite with auto-increment)
  // SERIAL = INTEGER + AUTO_INCREMENT sequence
  if (targetFormat === 'postgresql' && isAutoIncrement && col.generation_expression === null) {
    // Replace INT/INTEGER/BIGINT with SERIAL/BIGSERIAL
    if (!def.includes('SERIAL')) {
      if (dataType.toUpperCase() === 'BIGINT') {
        def = def.replace(/BIGINT/i, 'BIGSERIAL');
      } else if (dataType.toUpperCase() === 'INT' || dataType.toUpperCase() === 'INTEGER') {
        def = def.replace(/\bINT(EGER)?\b/i, 'SERIAL');
      }
    }
  }

  // Handle UNIQUE constraint (skip if already PRIMARY KEY)
  if (col.is_unique && !col.is_primary_key) {
    def += ' UNIQUE';
  }

  return def;
}

/**
 * Build FOREIGN KEY definition from ForeignKey metadata
 * Supports both single-column and composite (multi-column) foreign keys
 */
function buildForeignKeyDefinition(fk: ForeignKey, targetFormat: DatabaseFormat): string {
  // Handle both single column (string) and composite (array) foreign keys
  const columns = Array.isArray(fk.column) ? fk.column : [fk.column];
  const foreignColumns = Array.isArray(fk.foreign_key_column) ? fk.foreign_key_column : [fk.foreign_key_column];

  const quotedColumns = columns.map(col => quoteIdentifier(col, targetFormat)).join(', ');
  const quotedForeignTable = quoteIdentifier(fk.foreign_key_table, targetFormat);
  const quotedForeignColumns = foreignColumns.map(col => quoteIdentifier(col, targetFormat)).join(', ');

  let fkDef = `FOREIGN KEY (${quotedColumns}) REFERENCES ${quotedForeignTable}(${quotedForeignColumns})`;

  // Add ON DELETE clause
  if (fk.on_delete && fk.on_delete !== 'NO ACTION') {
    fkDef += ` ON DELETE ${fk.on_delete}`;
  }

  // Add ON UPDATE clause
  if (fk.on_update && fk.on_update !== 'NO ACTION') {
    fkDef += ` ON UPDATE ${fk.on_update}`;
  }

  return fkDef;
}

/**
 * Get all table names from the database (excluding system tables)
 * @param knex Knex instance
 * @param includeKnexTables Include knex_* migration tables
 * @param tablePrefix Filter tables by prefix (default: 'v4_' for v4 schema only)
 */
export async function getAllTables(knex: Knex, includeKnexTables = false, tablePrefix = 'v4_'): Promise<string[]> {
  const client = knex.client.config.client;

  let tables: string[] = [];

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    const knexFilter = includeKnexTables ? '' : "AND name NOT LIKE 'knex_%'";
    const result = await knex.raw(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      ${knexFilter}
      ORDER BY name
    `);
    tables = result.map((row: any) => row.name);
  } else if (client === 'mysql' || client === 'mysql2') {
    const result = await knex.raw('SHOW TABLES');
    const tableKey = Object.keys(result[0][0])[0];
    tables = result[0].map((row: any) => row[tableKey]);
    if (!includeKnexTables) {
      tables = tables.filter((t: string) => !t.startsWith('knex_'));
    }
  } else if (client === 'pg') {
    const knexFilter = includeKnexTables ? '' : "AND tablename NOT LIKE 'knex_%'";
    const result = await knex.raw(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ${knexFilter}
      ORDER BY tablename
    `);
    tables = result.rows.map((row: any) => row.tablename);
  } else {
    throw new Error(`Unsupported database client: ${client}`);
  }

  // Filter by table prefix (default: v4_ for current schema)
  if (tablePrefix) {
    tables = tables.filter((t: string) => t.startsWith(tablePrefix));
  }

  return tables;
}

/**
 * Get CREATE TABLE statement for a table using knex-schema-inspector
 * Replaces regex-based SQL conversion with metadata-driven approach
 */
export async function getCreateTableStatement(knex: Knex, table: string, targetFormat: DatabaseFormat): Promise<string> {
  const client = knex.client.config.client;

  // Initialize schema inspector (database-agnostic)
  const inspector = SchemaInspector(knex);

  // Get column metadata
  const columns: Column[] = await inspector.columnInfo(table);

  if (columns.length === 0) {
    throw new Error(`Table ${table} not found or has no columns`);
  }

  // Fix: knex-schema-inspector doesn't detect composite PRIMARY KEYs and UNIQUE constraints properly
  // Manually detect them using database-specific queries
  const compositeUniqueConstraints: string[][] = []; // Track composite UNIQUE constraints
  let compositePrimaryKey: string[] | null = null; // Track composite PRIMARY KEY

  if (client === 'pg') {
    // PostgreSQL: Query pg_constraint for composite PRIMARY KEY and UNIQUE constraints
    const constraints = await knex.raw(`
      SELECT
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        ARRAY_AGG(att.attname ORDER BY u.attposition) AS columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      CROSS JOIN LATERAL UNNEST(con.conkey) WITH ORDINALITY AS u(attnum, attposition)
      JOIN pg_attribute att ON att.attnum = u.attnum AND att.attrelid = con.conrelid
      WHERE rel.relname = ?
        AND nsp.nspname = 'public'
        AND con.contype IN ('p', 'u')
      GROUP BY con.conname, con.contype
    `, [table]);

    for (const constraint of constraints.rows) {
      // PostgreSQL returns arrays as strings like "{col1,col2}" - parse them
      let columnNames: string[];
      if (typeof constraint.columns === 'string') {
        // Parse PostgreSQL array format: "{col1,col2}" → ["col1", "col2"]
        columnNames = constraint.columns
          .replace(/^\{/, '') //Remove leading {
          .replace(/\}$/, '') // Remove trailing }
          .split(',')
          .map((col: string) => col.trim());
      } else if (Array.isArray(constraint.columns)) {
        columnNames = constraint.columns;
      } else {
        continue; // Skip invalid format
      }

      if (constraint.constraint_type === 'p' && columnNames.length > 1) {
        // Multi-column PRIMARY KEY
        compositePrimaryKey = columnNames;
        debugLog('DEBUG', `Found composite PRIMARY KEY on ${table}(${columnNames.join(', ')})`);
      } else if (constraint.constraint_type === 'u') {
        if (columnNames.length === 1) {
          // Single-column UNIQUE
          const col = columns.find(c => c.name === columnNames[0]);
          if (col && !col.is_primary_key) {
            col.is_unique = true;
            debugLog('DEBUG', `Marked ${table}.${col.name} as UNIQUE`);
          }
        } else if (columnNames.length > 1) {
          // Multi-column UNIQUE
          compositeUniqueConstraints.push(columnNames);
          debugLog('DEBUG', `Found composite UNIQUE on ${table}(${columnNames.join(', ')})`);
        }
      }
    }
  } else if (client === 'better-sqlite3' || client === 'sqlite3') {
    const indexResult = await knex.raw(`PRAGMA index_list(${table})`);

    // Knex raw() returns an array directly for SQLite
    const indexes = Array.isArray(indexResult) ? indexResult : [];

    for (const index of indexes) {
      // Check for PRIMARY KEY index
      if (index.origin === 'pk' && index.unique === 1) {
        const indexInfoResult = await knex.raw(`PRAGMA index_info(${index.name})`);
        const indexInfo = Array.isArray(indexInfoResult) ? indexInfoResult : [];
        const columnNames = indexInfo.map((idxCol: any) => idxCol.name);

        if (columnNames.length > 1) {
          // Composite PRIMARY KEY detected
          compositePrimaryKey = columnNames;
          debugLog('DEBUG', `Found composite PRIMARY KEY on ${table}(${columnNames.join(', ')}) from ${index.name}`);
        }
      }
      // Check if this is a UNIQUE index (skip PRIMARY KEY indexes)
      else if (index.unique === 1 && index.origin !== 'pk') {
        // Get columns in this index
        const indexInfoResult = await knex.raw(`PRAGMA index_info(${index.name})`);
        const indexInfo = Array.isArray(indexInfoResult) ? indexInfoResult : [];

        const columnNames = indexInfo.map((idxCol: any) => idxCol.name);

        if (columnNames.length === 1) {
          // Single-column UNIQUE - mark column as unique
          const col = columns.find(c => c.name === columnNames[0]);
          if (col && !col.is_primary_key) {
            col.is_unique = true;
            debugLog('DEBUG', `Marked ${table}.${col.name} as UNIQUE (single-column from ${index.name})`);
          }
        } else if (columnNames.length > 1) {
          // Composite UNIQUE - add to table-level constraints
          compositeUniqueConstraints.push(columnNames);
          debugLog('DEBUG', `Found composite UNIQUE on ${table}(${columnNames.join(', ')}) from ${index.name}`);

          // For MySQL: Convert TEXT to VARCHAR(191) for columns in composite UNIQUE
          if (targetFormat === 'mysql') {
            for (const colName of columnNames) {
              const col = columns.find(c => c.name === colName);
              if (col && !col.is_primary_key) {
                // Mark as part of composite unique (will be converted to VARCHAR later)
                (col as any).in_composite_unique = true;
              }
            }
          }
        }
      }
    }
  }

  // Build column definitions using buildColumnDefinition()
  const columnDefs: string[] = columns.map(col => buildColumnDefinition(col, targetFormat));

  // Add PRIMARY KEY constraint (with MySQL prefix length handling)
  // Use composite PRIMARY KEY if detected, otherwise fall back to column metadata
  const pkColumns = compositePrimaryKey || columns.filter(col => col.is_primary_key).map(col => col.name);
  if (pkColumns.length > 0) {
    // For MySQL: Apply (191) prefix to TEXT/long VARCHAR columns
    if (targetFormat === 'mysql') {
      const processedPkCols = pkColumns.map((colName) => {
        const col = columns.find(c => c.name === colName);
        if (col && (col.data_type.toUpperCase() === 'TEXT' ||
            (col.data_type.toUpperCase().includes('VARCHAR') && col.max_length && col.max_length > 191))) {
          return `${quoteIdentifier(colName, targetFormat)}(191)`;
        }
        return quoteIdentifier(colName, targetFormat);
      }).join(', ');
      columnDefs.push(`PRIMARY KEY (${processedPkCols})`);
    } else {
      const quotedPkColumns = pkColumns.map(col => quoteIdentifier(col, targetFormat));
      columnDefs.push(`PRIMARY KEY (${quotedPkColumns.join(', ')})`);
    }
  }

  // Add FOREIGN KEY constraints using buildForeignKeyDefinition()
  let foreignKeys: ForeignKey[] = await inspector.foreignKeys(table);

  // PostgreSQL: Manually query composite foreign keys (knex-schema-inspector misses them)
  if (client === 'pg') {
    const compositeFks = await knex.raw(`
      SELECT
        con.conname AS constraint_name,
        ARRAY_AGG(att.attname ORDER BY u.attposition) AS columns,
        ref_class.relname AS foreign_table,
        ARRAY_AGG(ref_att.attname ORDER BY u.attposition) AS foreign_columns,
        con.confdeltype AS on_delete,
        con.confupdtype AS on_update
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_class ref_class ON ref_class.oid = con.confrelid
      CROSS JOIN LATERAL UNNEST(con.conkey) WITH ORDINALITY AS u(attnum, attposition)
      JOIN pg_attribute att ON att.attnum = u.attnum AND att.attrelid = con.conrelid
      JOIN pg_attribute ref_att ON ref_att.attnum = con.confkey[u.attposition] AND ref_att.attrelid = con.confrelid
      WHERE rel.relname = ?
        AND nsp.nspname = 'public'
        AND con.contype = 'f'
      GROUP BY con.conname, ref_class.relname, con.confdeltype, con.confupdtype
    `, [table]);

    for (const fk of compositeFks.rows) {
      // Parse PostgreSQL arrays
      const columns = typeof fk.columns === 'string'
        ? fk.columns.replace(/^\{/, '').replace(/\}$/, '').split(',').map((s: string) => s.trim())
        : fk.columns;
      const foreignColumns = typeof fk.foreign_columns === 'string'
        ? fk.foreign_columns.replace(/^\{/, '').replace(/\}$/, '').split(',').map((s: string) => s.trim())
        : fk.foreign_columns;

      // Convert PostgreSQL delete/update action codes to SQL keywords
      const onDelete = fk.on_delete === 'c' ? 'CASCADE' : fk.on_delete === 'r' ? 'RESTRICT' : fk.on_delete === 'n' ? 'SET NULL' : 'NO ACTION';
      const onUpdate = fk.on_update === 'c' ? 'CASCADE' : fk.on_update === 'r' ? 'RESTRICT' : fk.on_update === 'n' ? 'SET NULL' : 'NO ACTION';

      // Create ForeignKey-like object
      const compositeFk: ForeignKey = {
        table: table,
        column: columns,  // Array for composite FK
        foreign_key_table: fk.foreign_table,
        foreign_key_column: foreignColumns,  // Array for composite FK
        on_delete: onDelete,
        on_update: onUpdate,
        constraint_name: fk.constraint_name
      };

      // Check if already exists in foreignKeys (single-column FKs from inspector)
      const isDuplicate = foreignKeys.some((existingFk) =>
        existingFk.constraint_name === compositeFk.constraint_name
      );

      if (!isDuplicate) {
        foreignKeys.push(compositeFk);
        debugLog('DEBUG', `Found composite FOREIGN KEY on ${table}(${columns.join(', ')}) → ${fk.foreign_table}(${foreignColumns.join(', ')})`);
      }
    }
  }

  for (const fk of foreignKeys) {
    columnDefs.push(buildForeignKeyDefinition(fk, targetFormat));
  }

  // Add composite UNIQUE constraints (from SQLite multi-column UNIQUE indexes)
  for (const uniqueCols of compositeUniqueConstraints) {
    const quotedCols = uniqueCols.map(col => quoteIdentifier(col, targetFormat)).join(', ');
    columnDefs.push(`UNIQUE (${quotedCols})`);
  }

  // Build CREATE TABLE statement with IF NOT EXISTS for idempotency
  const quotedTable = quoteIdentifier(table, targetFormat);
  const createSql = `CREATE TABLE IF NOT EXISTS ${quotedTable} (\n  ${columnDefs.join(',\n  ')}\n)`;

  // Add database-specific table options
  if (targetFormat === 'mysql') {
    return createSql + ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;';
  }

  return createSql + ';';
}
