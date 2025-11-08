// core/generate-dump.ts - Main SQL dump generation function

import type { Knex } from 'knex';
import type { DatabaseFormat, ConflictMode } from '../types.js';
import { generateHeader } from '../generators/headers.js';
import { generateForeignKeyControls, generateTransactionControl } from '../generators/controls.js';
import { getAllTables, getCreateTableStatement } from './table-export.js';
import { getAllViews, getCreateViewStatement } from './view-export.js';
import { getAllIndexes, getCreateIndexStatement } from './index-export.js';
import { generateSequenceResets } from './sequence-reset.js';
import { getTableDependencies, topologicalSort } from './dependency-sort.js';
import { getPrimaryKeyColumns } from '../schema/primary-keys.js';
import { generateBulkInsert } from '../formatters/bulk-insert.js';

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
