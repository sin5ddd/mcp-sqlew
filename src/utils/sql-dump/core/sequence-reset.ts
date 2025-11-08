// core/sequence-reset.ts - PostgreSQL sequence reset utilities

import type { Knex } from 'knex';

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
