// core/index-export.ts - Index export utilities

import type { Knex } from 'knex';
import type { DatabaseFormat } from '../types.js';
import {
  convertIdentifierQuotes,
} from '../../sql-dump-converters.js';
import { getAllIndexes, getIndexMetadata } from '../schema/indexes.js';
export type { IndexMetadata } from '../schema/indexes.js';

export { getAllIndexes, getIndexMetadata };

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
