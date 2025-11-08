// core/dependency-sort.ts - Table dependency sorting utilities

import type { Knex } from 'knex';
import { debugLog } from '../../debug-logger.js';

/**
 * Get foreign key dependencies for tables
 * Returns a map of table -> array of tables it depends on
 *
 * @internal Exported for testing purposes
 */
export async function getTableDependencies(knex: Knex, tables: string[]): Promise<Map<string, string[]>> {
  const dependencies = new Map<string, string[]>();
  const client = knex.client.config.client;

  for (const table of tables) {
    dependencies.set(table, []);
  }

  for (const table of tables) {
    try {
      if (client === 'better-sqlite3' || client === 'sqlite3') {
        // SQLite: Use PRAGMA foreign_key_list() for reliable FK detection
        // This catches both inline REFERENCES and explicit FOREIGN KEY syntax
        const result = await knex.raw(`PRAGMA foreign_key_list(${table})`);
        const fkList = Array.isArray(result) ? result : [];

        for (const fk of fkList) {
          const referencedTable = fk.table;
          if (tables.includes(referencedTable) && referencedTable !== table) {
            dependencies.get(table)!.push(referencedTable);
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
 *
 * @internal Exported for testing purposes
 */
export function topologicalSort(tables: string[], dependencies: Map<string, string[]>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(table: string) {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      // Circular dependency detected - log warning and continue
      debugLog('WARN', `Circular foreign key dependency detected involving table: ${table}`);
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
