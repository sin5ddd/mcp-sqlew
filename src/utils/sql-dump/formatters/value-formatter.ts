// formatters/value-formatter.ts - Value formatting for SQL insertion

import type { DatabaseFormat } from '../types.js';

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
      // Detect ISO 8601 format (e.g., '2025-11-05T00:07:53.343Z')
      // ISO 8601 pattern: YYYY-MM-DDTHH:MM:SS.sssZ or with timezone offset
      const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/;

      if (iso8601Pattern.test(value)) {
        // Parse ISO 8601 string and convert to database-compatible format
        const date = new Date(value);
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
      }

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
